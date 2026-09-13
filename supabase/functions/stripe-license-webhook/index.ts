import {
  LICENSE_PRODUCT,
  databaseRpc,
  encryptLicenseKey,
  generateLicenseKey,
  hashSecret,
  json,
  publicError,
  verifyStripeSignature,
} from "../_shared/license.ts";

type StripeCheckoutSession = {
  id?: string;
  mode?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  metadata?: { product?: string } | null;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(request, { error: "Method not allowed." }, 405);

  const rawBody = await request.text();
  try {
    const valid = await verifyStripeSignature(
      rawBody,
      request.headers.get("stripe-signature"),
    );
    if (!valid) return json(request, { error: "Invalid Stripe signature." }, 400);

    const event = JSON.parse(rawBody);
    const eventType = String(event.type || "");
    if (
      eventType !== "checkout.session.completed" &&
      eventType !== "checkout.session.async_payment_succeeded"
    ) {
      return json(request, { received: true });
    }

    const session = (event.data?.object || {}) as StripeCheckoutSession;
    if (
      session.mode !== "payment" ||
      session.payment_status !== "paid" ||
      session.metadata?.product !== LICENSE_PRODUCT
    ) {
      return json(request, { received: true });
    }
    if (!session.id || !event.id) throw new Error("Stripe event is missing an identifier.");

    const licenseKey = generateLicenseKey();
    const normalizedKey = licenseKey.replace(/-/g, "");
    const encrypted = await encryptLicenseKey(licenseKey);
    const keyHash = await hashSecret(normalizedKey);
    const revealUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await databaseRpc("issue_paid_license", {
      p_event_id: String(event.id),
      p_event_type: eventType,
      p_checkout_session_id: session.id,
      p_customer_email:
        session.customer_details?.email || session.customer_email || null,
      p_amount_total: session.amount_total ?? null,
      p_currency: session.currency || null,
      p_key_hash: keyHash,
      p_key_prefix: "EVF1",
      p_key_last_four: normalizedKey.slice(-4),
      p_ciphertext: encrypted.ciphertext,
      p_iv: encrypted.iv,
      p_reveal_until: revealUntil,
    });

    return json(request, { received: true });
  } catch (error) {
    return json(request, { error: publicError(error) }, 500);
  }
});
