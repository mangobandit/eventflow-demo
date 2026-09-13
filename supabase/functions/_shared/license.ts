const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const STRIPE_API_VERSION = "2026-02-25.clover";
export const LICENSE_PRODUCT = "eventflow-lifetime";

const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LICENSE_PATTERN = /^EVF1[A-HJ-NP-Z2-9]{24}$/;

export function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function allowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return allowedOrigins().includes(origin.replace(/\/$/, ""));
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  const allowedOrigin = origin && allowedOrigins().includes(origin) ? origin : "";
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
  };
}

export function json(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });
}

export function rejectDisallowedOrigin(request: Request): Response | null {
  if (isAllowedOrigin(request)) return null;
  return json(request, { error: "This site is not allowed to call the licensing service." }, 403);
}

export function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected licensing error.";
  console.error(message);
  return "The licensing service could not complete that request. Please try again.";
}

export function generateLicenseKey(): string {
  const random = crypto.getRandomValues(new Uint8Array(24));
  const payload = Array.from(random, (byte) => LICENSE_ALPHABET[byte & 31]).join("");
  return `EVF1-${payload.match(/.{1,4}/g)?.join("-")}`;
}

export function normalizeLicenseKey(value: string): string {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!LICENSE_PATTERN.test(normalized)) {
    throw new Error("Enter a complete EventFlow licence key.");
  }
  return normalized;
}

export async function hashSecret(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env("LICENSE_HASH_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashActivationToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function encryptLicenseKey(
  licenseKey: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(licenseKey),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptLicenseKey(ciphertext: string, iv: string): Promise<string> {
  const key = await importEncryptionKey();
  const ivBytes = base64ToBytes(iv);
  const ciphertextBytes = base64ToBytes(ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(ivBytes) },
    key,
    toArrayBuffer(ciphertextBytes),
  );
  return decoder.decode(plaintext);
}

export function generateActivationToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function importEncryptionKey(): Promise<CryptoKey> {
  const bytes = base64ToBytes(env("LICENSE_ENCRYPTION_KEY"));
  if (bytes.byteLength !== 32) {
    throw new Error("LICENSE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(bytes),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false;

  const components = signatureHeader.split(",").map((part) => part.trim().split("="));
  const timestamp = components.find(([key]) => key === "t")?.[1];
  const signatures = components.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (ageSeconds > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env("STRIPE_WEBHOOK_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedPayload = encoder.encode(`${timestamp}.${payload}`);

  for (const signature of signatures) {
    if (!/^[a-f0-9]{64}$/i.test(signature)) continue;
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(hexToBytes(signature)),
      signedPayload,
    );
    if (valid) return true;
  }
  return false;
}

export async function stripeRequest(
  path: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    const stripeMessage = body?.error?.message || "Stripe rejected the request.";
    throw new Error(`Stripe error: ${stripeMessage}`);
  }
  return body;
}

export async function databaseRpc<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(
    `${env("SUPABASE_URL")}/rest/v1/rpc/${encodeURIComponent(functionName)}`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Database RPC ${functionName} failed: ${responseBody}`);
  }
  return (responseBody ? JSON.parse(responseBody) : null) as T;
}

export async function readJsonBody(
  request: Request,
  maxBytes = 8_192,
): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > maxBytes) throw new Error("Request body is too large.");
  const text = await request.text();
  if (encoder.encode(text).byteLength > maxBytes) throw new Error("Request body is too large.");
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const matches = hex.match(/.{2}/g) || [];
  return new Uint8Array(matches.map((byte) => Number.parseInt(byte, 16)));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
