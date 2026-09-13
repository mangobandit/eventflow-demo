import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const client = read("license.js");
const page = read("license.html");
const shared = read("supabase/functions/_shared/license.ts");
const checkout = read("supabase/functions/create-license-checkout/index.ts");
const webhook = read("supabase/functions/stripe-license-webhook/index.ts");
const delivery = read("supabase/functions/get-license/index.ts");
const migration = read("supabase/migrations/20260730_paid_licensing.sql");
const config = read("config.js");
const serviceWorker = read("sw.js");
const plannerAuth = read("planner-auth.js");

check(page.includes("data-buy"), "Licence page must expose a purchase action.");
check(page.includes('id="delivery"'), "Licence page must include the secure delivery state.");
check(page.includes('id="activation-form"'), "Licence page must include activation.");
check(client.includes("create-license-checkout"), "Client must start Stripe Checkout through the server.");
check(client.includes("get-license"), "Client must retrieve a paid licence through the server.");
check(client.includes("activate-license"), "Client must activate through the server.");
check(!client.includes("STRIPE_SECRET_KEY"), "Browser code must not reference the Stripe secret key.");
check(!client.includes("SUPABASE_SERVICE_ROLE_KEY"), "Browser code must not reference the service-role key.");
check(!client.includes("generateLicenseKey"), "Browser code must not generate licence keys.");
check(client.includes("activation_token"), "Browser must store an activation token instead of a raw licence key.");
check(!/localStorage\.setItem\([^,]+,\s*(?:revealedKey|licenseKey|licenceKey)/.test(client), "Raw licence keys must not be stored in localStorage.");

check(shared.includes('STRIPE_API_VERSION = "2026-02-25.clover"'), "Stripe requests must pin the current API version.");
check(shared.includes("verifyStripeSignature"), "Stripe webhook signatures must be verified.");
check(shared.includes("ageSeconds > 300"), "Webhook verification must enforce timestamp tolerance.");
check(shared.includes("AES-GCM"), "Secure delivery must use authenticated encryption.");
check(shared.includes("HMAC"), "Licence lookup must use a keyed hash.");
check(webhook.includes('session.payment_status !== "paid"'), "Webhook must issue only after paid status.");
check(webhook.includes("issue_paid_license"), "Webhook issuance must use the atomic database RPC.");
check(delivery.includes('session.payment_status !== "paid"'), "Delivery must independently verify payment with Stripe.");
check(checkout.includes("checkout/sessions"), "Payments must use Stripe Checkout Sessions.");
check(!checkout.includes("payment_method_types"), "Checkout must use Stripe dynamic payment methods.");

for (const table of ["license_orders", "licenses", "license_deliveries", "license_activations", "stripe_webhook_events"]) {
  check(migration.includes(`alter table public.${table} enable row level security`), `${table} must enable RLS.`);
  check(migration.includes(`revoke all on public.${table} from anon, authenticated`), `${table} must deny direct client access.`);
}
check(migration.includes("on conflict (order_id) do nothing"), "Licence issuance must be idempotent per order.");
const issuanceParameters = migration.match(/create or replace function public\.issue_paid_license\s*\(([\s\S]*?)\)\s*returns/i)?.[1];
check(Boolean(issuanceParameters), "Licence issuance function must declare its parameters.");
const normalizeTypes = (parameters) => parameters.split(",").map((parameter) => parameter.trim().replace(/\s+/g, " ").toLowerCase()).join(",");
const declaredIssuanceTypes = issuanceParameters
  ? normalizeTypes(issuanceParameters.split(",").map((parameter) => parameter.trim().replace(/^\w+\s+/, "")).join(","))
  : "";
for (const privilege of ["grant execute", "revoke all"]) {
  const signature = migration.match(new RegExp(`${privilege} on function public\\.issue_paid_license\\s*\\(([^)]*)\\)`, "i"))?.[1];
  check(Boolean(signature) && normalizeTypes(signature) === declaredIssuanceTypes, `${privilege} must match the declared licence issuance parameter types.`);
}
// Composite row variables cannot appear alongside other SELECT INTO targets in PL/pgSQL.
for (const [, rowVariable] of migration.matchAll(/\b(\w+)\s+public\.\w+%rowtype\s*;/gi)) {
  check(!new RegExp(`\\binto\\s+${rowVariable}\\s*,`, "i").test(migration), `${rowVariable} must not be the first of multiple SELECT INTO targets.`);
}
check(migration.includes("v_existing.deactivated_at is not null"), "Reactivating a device must still respect the activation limit.");
check(migration.includes("enforce_on_planner"), "Database must provide server-side paid-access enforcement.");
check(migration.includes("license_activation_id"), "Planner sessions must bind to a paid activation.");
check(plannerAuth.includes("p_activation_token"), "Paid planner login must send the activation token.");
check(config.includes("requirePaidLicense: false"), "Paid enforcement must default off for the existing wedding deployment.");
check(serviceWorker.includes('url.pathname.includes("license")'), "The service worker must not cache licence delivery pages.");

for (const source of [client, page, shared, checkout, webhook, delivery, migration, config]) {
  check(!/sk_(?:test|live)_[A-Za-z0-9]{8,}/.test(source), "A Stripe secret key appears to be committed.");
  check(!/whsec_[A-Za-z0-9]{8,}/.test(source), "A Stripe webhook secret appears to be committed.");
  check(!/service_role[^A-Za-z0-9]{0,10}eyJ[A-Za-z0-9._-]+/i.test(source), "A Supabase service-role token appears to be committed.");
}

if (failures.length) {
  console.error("Licence contract failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Licence payment, delivery and activation contracts passed.");
