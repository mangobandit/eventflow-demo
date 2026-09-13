import {
  LICENSE_PRODUCT,
  databaseRpc,
  decryptLicenseKey,
  json,
  publicError,
  readJsonBody,
  rejectDisallowedOrigin,
  stripeRequest,
} from "../_shared/license.ts";

type Delivery = {
  ciphertext: string;
  iv: string;
  reveal_until: string;
  key_prefix: string;
  key_last_four: string;
  activation_limit: number;
  license_status: string;
};

type StripeCheckoutSession = {
  payment_status?: string;
  mode?: string;
  metadata?: { product?: string } | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(request, { ok: true });
  if (request.method !== "POST") return json(request, { error: "Method not allowed." }, 405);

  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;

  try {
    const body = await readJsonBody(request);
    const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
    if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) {
      return json(request, { error: "A valid checkout session is required." }, 400);
    }

    const session = await stripeRequest(
      `checkout/sessions/${encodeURIComponent(sessionId)}`,
    ) as StripeCheckoutSession;
    if (
      session.payment_status !== "paid" ||
      session.mode !== "payment" ||
      session.metadata?.product !== LICENSE_PRODUCT
    ) {
      return json(request, { error: "Payment has not been confirmed." }, 402);
    }

    const rows = await databaseRpc<Delivery[]>("get_license_delivery", {
      p_checkout_session_id: sessionId,
    });
    const delivery = rows?.[0];
    if (!delivery) {
      return json(request, { pending: true }, 202);
    }
    if (new Date(delivery.reveal_until).getTime() <= Date.now()) {
      return json(
        request,
        { error: "This secure delivery link has expired. Contact support to reissue the key." },
        410,
      );
    }

    const licenseKey = await decryptLicenseKey(delivery.ciphertext, delivery.iv);
    await databaseRpc("mark_license_revealed", { p_checkout_session_id: sessionId });

    return json(request, {
      license_key: licenseKey,
      key_hint: `${delivery.key_prefix}-••••-••••-••••-••••-••••-${delivery.key_last_four}`,
      activation_limit: delivery.activation_limit,
      status: delivery.license_status,
      reveal_until: delivery.reveal_until,
    });
  } catch (error) {
    return json(request, { error: publicError(error) }, 500);
  }
});
