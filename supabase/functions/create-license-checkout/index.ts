import {
  LICENSE_PRODUCT,
  json,
  publicError,
  rejectDisallowedOrigin,
  stripeRequest,
} from "../_shared/license.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(request, { ok: true });
  if (request.method !== "POST") return json(request, { error: "Method not allowed." }, 405);

  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;

  try {
    const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "").trim().replace(/\/$/, "");
    const priceId = (Deno.env.get("STRIPE_LICENSE_PRICE_ID") || "").trim();
    if (!siteUrl || !priceId) throw new Error("Checkout is not configured.");

    const form = new URLSearchParams({
      mode: "payment",
      success_url: `${siteUrl}/license.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/license.html?checkout=cancelled`,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      customer_creation: "always",
      billing_address_collection: "auto",
      "tax_id_collection[enabled]": "true",
      "metadata[product]": LICENSE_PRODUCT,
      "payment_intent_data[metadata][product]": LICENSE_PRODUCT,
    });

    if ((Deno.env.get("STRIPE_ALLOW_PROMOTION_CODES") || "").toLowerCase() === "true") {
      form.set("allow_promotion_codes", "true");
    }
    if ((Deno.env.get("STRIPE_AUTOMATIC_TAX") || "").toLowerCase() === "true") {
      form.set("automatic_tax[enabled]", "true");
    }

    const session = await stripeRequest("checkout/sessions", {
      method: "POST",
      body: form.toString(),
    });
    if (typeof session.url !== "string") throw new Error("Stripe did not return a checkout URL.");

    return json(request, { url: session.url });
  } catch (error) {
    return json(request, { error: publicError(error) }, 500);
  }
});
