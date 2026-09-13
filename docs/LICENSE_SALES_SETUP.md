# EventFlow paid licensing setup

EventFlow uses Stripe-hosted Checkout for a one-time payment, a signed Stripe webhook for fulfilment, and Supabase Edge Functions plus Postgres for key issuance and activation.

The raw licence key is never generated in the browser. The database stores:

- a keyed SHA-256 hash for licence lookup;
- an AES-256-GCM encrypted delivery copy, available through the paid Checkout Session for 30 days;
- a revocable activation token hash for each installation;
- no card details and no raw activation tokens.

The browser keeps the opaque Checkout Session ID—not the raw key—so the customer can refresh or reopen the success page during that delivery window.

## Before you start

You need:

- a Stripe account with a one-time EventFlow product and price;
- the existing Supabase project and Supabase CLI;
- a public HTTPS URL that serves `license.html`;
- a support process for lost keys, refunds and activation resets.

Choose the amount and currency in Stripe. The web page deliberately does not hard-code a price; Checkout is the source of truth and shows the total, currency and tax before payment.

## 1. Apply the database migration

Run `supabase/migrations/20260730_paid_licensing.sql` in the Supabase SQL Editor after the existing migrations.

The migration is non-enforcing by default. It creates the licence tables and Edge Function RPCs, but the current private planner continues to work normally.

## 2. Create private secrets

Generate the two cryptographic secrets locally:

```bash
npm run license:secrets
```

Copy `.env.example` to a private file such as `.env.license`, replace every placeholder, and add the generated values. `.env.license` is ignored by Git.

Set:

- `STRIPE_SECRET_KEY`: Stripe test secret key while testing, then the live secret key.
- `STRIPE_LICENSE_PRICE_ID`: the one-time Stripe Price ID.
- `LICENSE_HASH_SECRET`: generated HMAC secret used for licence-key lookup.
- `LICENSE_ENCRYPTION_KEY`: generated base64-encoded 32-byte AES key used only for secure key delivery.
- `PUBLIC_SITE_URL`: the exact origin serving `license.html`, without a trailing slash.
- `ALLOWED_ORIGINS`: comma-separated exact browser origins allowed to call the functions.
- `STRIPE_AUTOMATIC_TAX`: set to `true` only after Stripe Tax is configured for the business.
- `STRIPE_ALLOW_PROMOTION_CODES`: set to `true` if Checkout should accept active promotion codes.

Upload the secrets:

```bash
supabase secrets set --env-file .env.license
```

Do not change `LICENSE_HASH_SECRET` after issuing licences; existing licence keys would stop validating. Rotating `LICENSE_ENCRYPTION_KEY` requires re-encrypting unexpired delivery records first.

## 3. Deploy the functions

From the repository root:

```bash
supabase functions deploy create-license-checkout
supabase functions deploy stripe-license-webhook
supabase functions deploy get-license
supabase functions deploy activate-license
```

`supabase/config.toml` marks these public endpoints as not requiring a Supabase user JWT. Their own controls are:

- exact-origin checks for browser calls;
- Stripe signature verification with a five-minute tolerance;
- direct Stripe payment-status verification before key reveal;
- high-entropy keys and activation tokens;
- database constraints, row-level security and service-role-only RPCs.

## 4. Register the Stripe webhook

In Stripe Workbench, add this endpoint:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-license-webhook
```

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`, then upload the updated secrets again.

For local testing, use the Stripe CLI to forward the same two events to a locally served Edge Function and use the CLI-provided `whsec_...` secret.

## 5. Connect the web page

`license.js` derives the function URL from `supabaseUrl` in `config.js`. If licensing lives in a different Supabase project, set:

```js
licenseApiBaseUrl: "https://YOUR_PROJECT_REF.supabase.co/functions/v1"
```

Keep `requirePaidLicense: false` until the complete test checklist below passes.

## 6. Test the complete payment path

Use Stripe test mode:

1. Open `license.html` from an allowed origin.
2. Start Checkout and complete a test payment.
3. Confirm the success page reveals one key beginning with `EVF1`.
4. Refresh the page and confirm the same key is returned, not a new key.
5. Activate the key and confirm an opaque activation token—not the raw key—is stored locally.
6. Repeat activation on additional browsers and confirm the fourth distinct installation is rejected.
7. Replay the Stripe event and confirm no second licence is issued.
8. Submit a forged webhook signature and confirm it is rejected.
9. Confirm `anon` and `authenticated` cannot select any licence table directly.
10. Run `npm test`.

## 7. Enforce payment on the planner

Only enable this after the purchaser has successfully activated a key in `license.html`.

First enable the server-side switch in the Supabase SQL Editor:

```sql
update public.license_settings
set enforce_on_planner = true,
    updated_at = now()
where id is true;
```

Then set this in `config.js` and deploy the site:

```js
requirePaidLicense: true
```

Both switches matter:

- the database switch is the security boundary and blocks bypasses of the browser UI;
- the browser switch sends the activation token during planner login and gives the customer a useful activation message.

Once enforcement is on, planner sessions are linked to a paid activation. Every existing planner RPC calls `require_planner_session`, which rejects expired, revoked or deactivated licences.

To turn enforcement off safely:

```sql
update public.license_settings
set enforce_on_planner = false,
    updated_at = now()
where id is true;
```

## Licence operations

List recent paid orders without exposing key material:

```sql
select
  o.paid_at,
  o.customer_email,
  o.amount_total,
  upper(o.currency) as currency,
  l.key_prefix || '-…-' || l.key_last_four as key_hint,
  l.status,
  count(a.id) filter (where a.deactivated_at is null) as active_installations
from public.license_orders o
join public.licenses l on l.order_id = o.id
left join public.license_activations a on a.license_id = l.id
group by o.id, l.id
order by o.paid_at desc;
```

Revoke a licence by its safe key hint:

```sql
update public.licenses
set status = 'revoked',
    revoked_at = now(),
    updated_at = now()
where key_prefix = 'EVF1'
  and key_last_four = 'LAST';
```

Deactivate a single installation:

```sql
update public.license_activations
set deactivated_at = now()
where id = 'ACTIVATION_UUID';
```

Refunds and disputes do not automatically revoke access in this first release. Handle the Stripe event in the webhook and update `license_orders.payment_status` plus `licenses.status` before relying on automated revocation.

## Important commercial boundary

A licence can protect server-side features; it cannot make publicly hosted HTML, CSS and JavaScript impossible to copy. Keep valuable write operations and private data behind server-side functions that validate a paid activation. The included planner RPCs do this when enforcement is enabled.

Before going live, review consumer terms, refund policy, privacy notice, VAT/sales-tax registration, support contact details and Stripe's live-mode checklist for the countries where the product is sold.
