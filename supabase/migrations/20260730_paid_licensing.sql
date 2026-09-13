-- Paid EventFlow licences. All browser access goes through Edge Functions.
-- Raw licence keys are encrypted before insertion; only keyed hashes are used for lookup.

create extension if not exists pgcrypto;

create table if not exists public.license_orders (
  id uuid primary key default gen_random_uuid(),
  stripe_checkout_session_id text not null unique,
  customer_email text,
  amount_total bigint check (amount_total is null or amount_total >= 0),
  currency text check (currency is null or currency ~ '^[a-z]{3}$'),
  payment_status text not null default 'paid' check (payment_status in ('paid', 'refunded', 'disputed')),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.license_orders(id) on delete restrict,
  key_hash text not null unique check (length(key_hash) = 64),
  key_prefix text not null default 'EVF1',
  key_last_four text not null check (length(key_last_four) = 4),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  activation_limit smallint not null default 3 check (activation_limit between 1 and 100),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.license_deliveries (
  license_id uuid primary key references public.licenses(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  reveal_until timestamptz not null,
  first_revealed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.license_activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  installation_id uuid not null,
  token_hash text not null unique check (length(token_hash) = 64),
  label text,
  first_activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deactivated_at timestamptz,
  unique (license_id, installation_id)
);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.license_settings (
  id boolean primary key default true check (id),
  enforce_on_planner boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.license_settings (id, enforce_on_planner)
values (true, false)
on conflict (id) do nothing;

create index if not exists license_orders_customer_email_idx
  on public.license_orders (lower(customer_email))
  where customer_email is not null;

create index if not exists license_activations_active_license_idx
  on public.license_activations (license_id)
  where deactivated_at is null;

alter table public.license_orders enable row level security;
alter table public.licenses enable row level security;
alter table public.license_deliveries enable row level security;
alter table public.license_activations enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.license_settings enable row level security;

revoke all on public.license_orders from anon, authenticated;
revoke all on public.licenses from anon, authenticated;
revoke all on public.license_deliveries from anon, authenticated;
revoke all on public.license_activations from anon, authenticated;
revoke all on public.stripe_webhook_events from anon, authenticated;
revoke all on public.license_settings from anon, authenticated;

alter table public.planner_sessions
  add column if not exists license_activation_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'planner_sessions_license_activation_id_fkey'
       and conrelid = 'public.planner_sessions'::regclass
  ) then
    alter table public.planner_sessions
      add constraint planner_sessions_license_activation_id_fkey
      foreign key (license_activation_id)
      references public.license_activations(id)
      on delete set null;
  end if;
end $$;

create index if not exists planner_sessions_license_activation_idx
  on public.planner_sessions (license_activation_id)
  where license_activation_id is not null;

create or replace function public.issue_paid_license(
  p_event_id text,
  p_event_type text,
  p_checkout_session_id text,
  p_customer_email text,
  p_amount_total bigint,
  p_currency text,
  p_key_hash text,
  p_key_prefix text,
  p_key_last_four text,
  p_ciphertext text,
  p_iv text,
  p_reveal_until timestamptz
)
returns table (license_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_license_id uuid;
  v_created boolean := false;
begin
  if p_checkout_session_id is null or p_event_id is null then
    raise exception 'Stripe identifiers are required';
  end if;

  insert into public.stripe_webhook_events (event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;

  insert into public.license_orders (
    stripe_checkout_session_id,
    customer_email,
    amount_total,
    currency,
    payment_status
  )
  values (
    p_checkout_session_id,
    nullif(lower(trim(p_customer_email)), ''),
    p_amount_total,
    lower(p_currency),
    'paid'
  )
  on conflict (stripe_checkout_session_id) do update
  set customer_email = coalesce(public.license_orders.customer_email, excluded.customer_email),
      amount_total = coalesce(public.license_orders.amount_total, excluded.amount_total),
      currency = coalesce(public.license_orders.currency, excluded.currency),
      payment_status = 'paid'
  returning id into v_order_id;

  insert into public.licenses (
    order_id,
    key_hash,
    key_prefix,
    key_last_four
  )
  values (
    v_order_id,
    p_key_hash,
    p_key_prefix,
    p_key_last_four
  )
  on conflict (order_id) do nothing
  returning id into v_license_id;

  if v_license_id is not null then
    v_created := true;
    insert into public.license_deliveries (
      license_id,
      ciphertext,
      iv,
      reveal_until
    )
    values (
      v_license_id,
      p_ciphertext,
      p_iv,
      p_reveal_until
    );
  else
    select l.id
      into v_license_id
      from public.licenses l
     where l.order_id = v_order_id;
  end if;

  return query select v_license_id, v_created;
end;
$$;

create or replace function public.get_license_delivery(p_checkout_session_id text)
returns table (
  ciphertext text,
  iv text,
  reveal_until timestamptz,
  key_prefix text,
  key_last_four text,
  activation_limit smallint,
  license_status text
)
language sql
security definer
set search_path = ''
as $$
  select
    d.ciphertext,
    d.iv,
    d.reveal_until,
    l.key_prefix,
    l.key_last_four,
    l.activation_limit,
    l.status
  from public.license_orders o
  join public.licenses l on l.order_id = o.id
  join public.license_deliveries d on d.license_id = l.id
  where o.stripe_checkout_session_id = p_checkout_session_id
    and o.payment_status = 'paid'
  limit 1;
$$;

create or replace function public.mark_license_revealed(p_checkout_session_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.license_deliveries d
     set first_revealed_at = coalesce(d.first_revealed_at, now())
    from public.licenses l
    join public.license_orders o on o.id = l.order_id
   where d.license_id = l.id
     and o.stripe_checkout_session_id = p_checkout_session_id;
$$;

create or replace function public.activate_paid_license(
  p_key_hash text,
  p_installation_id uuid,
  p_token_hash text,
  p_label text default null
)
returns table (
  valid boolean,
  status text,
  activation_limit smallint,
  active_activations bigint,
  expires_at timestamptz,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_license public.licenses%rowtype;
  v_active_count bigint;
  v_existing public.license_activations%rowtype;
  v_has_existing boolean := false;
begin
  select *
    into v_license
    from public.licenses
   where key_hash = p_key_hash
   for update;

  if not found then
    return query select false, 'invalid'::text, 0::smallint, 0::bigint, null::timestamptz, 'Licence key not recognised.'::text;
    return;
  end if;

  if v_license.status <> 'active' or v_license.revoked_at is not null then
    return query select false, v_license.status, v_license.activation_limit, 0::bigint, v_license.expires_at, 'This licence is not active.'::text;
    return;
  end if;

  if v_license.expires_at is not null and v_license.expires_at <= now() then
    return query select false, 'expired'::text, v_license.activation_limit, 0::bigint, v_license.expires_at, 'This licence has expired.'::text;
    return;
  end if;

  select *
    into v_existing
    from public.license_activations
   where license_id = v_license.id
     and installation_id = p_installation_id;
  v_has_existing := found;

  select count(*)
    into v_active_count
    from public.license_activations
   where license_id = v_license.id
     and deactivated_at is null;

  if (
    not v_has_existing
    or v_existing.deactivated_at is not null
  ) and v_active_count >= v_license.activation_limit then
    return query select false, 'limit_reached'::text, v_license.activation_limit, v_active_count, v_license.expires_at, 'This licence has reached its activation limit.'::text;
    return;
  end if;

  insert into public.license_activations (
    license_id,
    installation_id,
    token_hash,
    label,
    deactivated_at,
    last_seen_at
  )
  values (
    v_license.id,
    p_installation_id,
    p_token_hash,
    nullif(trim(p_label), ''),
    null,
    now()
  )
  on conflict (license_id, installation_id) do update
  set token_hash = excluded.token_hash,
      label = coalesce(excluded.label, public.license_activations.label),
      deactivated_at = null,
      last_seen_at = now();

  select count(*)
    into v_active_count
    from public.license_activations
   where license_id = v_license.id
     and deactivated_at is null;

  return query select true, 'active'::text, v_license.activation_limit, v_active_count, v_license.expires_at, 'Licence activated.'::text;
end;
$$;

create or replace function public.validate_paid_activation(
  p_token_hash text,
  p_installation_id uuid
)
returns table (
  valid boolean,
  status text,
  activation_limit smallint,
  active_activations bigint,
  expires_at timestamptz,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_license public.licenses%rowtype;
  v_activation_id uuid;
  v_active_count bigint;
  v_match record;
begin
  select l as license_record, a.id as activation_id
    into v_match
    from public.license_activations a
    join public.licenses l on l.id = a.license_id
   where a.token_hash = p_token_hash
     and a.installation_id = p_installation_id
     and a.deactivated_at is null;

  if not found then
    return query select false, 'invalid'::text, 0::smallint, 0::bigint, null::timestamptz, 'Activation not recognised.'::text;
    return;
  end if;

  v_license := v_match.license_record;
  v_activation_id := v_match.activation_id;

  if v_license.status <> 'active' or v_license.revoked_at is not null then
    return query select false, v_license.status, v_license.activation_limit, 0::bigint, v_license.expires_at, 'This licence is not active.'::text;
    return;
  end if;

  if v_license.expires_at is not null and v_license.expires_at <= now() then
    return query select false, 'expired'::text, v_license.activation_limit, 0::bigint, v_license.expires_at, 'This licence has expired.'::text;
    return;
  end if;

  update public.license_activations
     set last_seen_at = now()
   where id = v_activation_id;

  select count(*)
    into v_active_count
    from public.license_activations
   where license_id = v_license.id
     and deactivated_at is null;

  return query select true, 'active'::text, v_license.activation_limit, v_active_count, v_license.expires_at, 'Activation is valid.'::text;
end;
$$;

create or replace function public.valid_planner_license_activation(
  p_activation_token text,
  p_installation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_activation_id uuid;
  v_token text := btrim(coalesce(p_activation_token, ''));
begin
  if v_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'A paid EventFlow licence must be activated first' using errcode = '28000';
  end if;

  select a.id
    into v_activation_id
    from public.license_activations a
    join public.licenses l on l.id = a.license_id
   where a.token_hash = encode(digest(v_token, 'sha256'), 'hex')
     and a.installation_id = p_installation_id
     and a.deactivated_at is null
     and l.status = 'active'
     and l.revoked_at is null
     and (l.expires_at is null or l.expires_at > now())
   limit 1;

  if v_activation_id is null then
    raise exception 'A paid EventFlow licence must be activated first' using errcode = '28000';
  end if;

  update public.license_activations
     set last_seen_at = now()
   where id = v_activation_id;

  return v_activation_id;
end;
$$;

create or replace function public.planner_login_core(
  p_username text,
  p_password text,
  p_license_activation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_password text := coalesce(p_password, '');
  v_user public.planner_users%rowtype;
  v_token text;
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  delete from public.planner_sessions
  where expires_at < now() - interval '1 day'
     or revoked_at < now() - interval '1 day';

  select * into v_user
  from public.planner_users
  where username = v_username
  for update;

  if not found or v_user.enabled is not true then
    perform pg_sleep(0.25);
    raise exception 'Invalid username or password' using errcode = '28000';
  end if;

  if v_user.locked_until is not null and v_user.locked_until > now() then
    raise exception 'Too many attempts. Try again in a few minutes.' using errcode = '28000';
  end if;

  if crypt(v_password, v_user.password_hash) <> v_user.password_hash then
    update public.planner_users
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= 8 then now() + interval '15 minutes' else locked_until end
    where username = v_user.username;
    perform pg_sleep(0.25);
    raise exception 'Invalid username or password' using errcode = '28000';
  end if;

  update public.planner_users
  set failed_attempts = 0,
      locked_until = null
  where username = v_user.username;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.planner_sessions (
    username,
    token_hash,
    expires_at,
    license_activation_id
  )
  values (
    v_user.username,
    digest(v_token, 'sha256'),
    v_expires_at,
    p_license_activation_id
  );

  return jsonb_build_object(
    'session_token', v_token,
    'expires_at', v_expires_at,
    'identity', jsonb_build_object(
      'username', v_user.username,
      'planner_person', v_user.planner_person,
      'display_name', v_user.display_name
    )
  );
end;
$$;

create or replace function public.planner_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enforce boolean := false;
begin
  select enforce_on_planner
    into v_enforce
    from public.license_settings
   where id is true;

  if coalesce(v_enforce, false) then
    raise exception 'A paid EventFlow licence must be activated first' using errcode = '28000';
  end if;

  return public.planner_login_core(p_username, p_password, null);
end;
$$;

create or replace function public.planner_login(
  p_username text,
  p_password text,
  p_activation_token text,
  p_installation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enforce boolean := false;
  v_activation_id uuid;
begin
  select enforce_on_planner
    into v_enforce
    from public.license_settings
   where id is true;

  if coalesce(v_enforce, false) then
    v_activation_id := public.valid_planner_license_activation(
      p_activation_token,
      p_installation_id
    );
  end if;

  return public.planner_login_core(p_username, p_password, v_activation_id);
end;
$$;

create or replace function public.require_planner_session(p_session_token text)
returns public.planner_users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := lower(btrim(coalesce(p_session_token, '')));
  v_user public.planner_users%rowtype;
  v_enforce boolean := false;
begin
  if v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Planner session expired' using errcode = '28000';
  end if;

  select enforce_on_planner
    into v_enforce
    from public.license_settings
   where id is true;

  select u.* into v_user
  from public.planner_sessions s
  join public.planner_users u on u.username = s.username
  where s.token_hash = digest(v_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
    and u.enabled is true
    and (
      not coalesce(v_enforce, false)
      or exists (
        select 1
          from public.license_activations a
          join public.licenses l on l.id = a.license_id
         where a.id = s.license_activation_id
           and a.deactivated_at is null
           and l.status = 'active'
           and l.revoked_at is null
           and (l.expires_at is null or l.expires_at > now())
      )
    )
  limit 1;

  if not found then
    raise exception 'Planner session expired' using errcode = '28000';
  end if;

  update public.planner_sessions
  set last_seen_at = now()
  where token_hash = digest(v_token, 'sha256');

  return v_user;
end;
$$;

revoke all on function public.issue_paid_license(text, text, text, text, bigint, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_license_delivery(text) from public, anon, authenticated;
revoke all on function public.mark_license_revealed(text) from public, anon, authenticated;
revoke all on function public.activate_paid_license(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.validate_paid_activation(text, uuid) from public, anon, authenticated;
revoke all on function public.valid_planner_license_activation(text, uuid) from public, anon, authenticated;
revoke all on function public.planner_login_core(text, text, uuid) from public, anon, authenticated;
revoke all on function public.planner_login(text, text, text, uuid) from public;

grant execute on function public.issue_paid_license(text, text, text, text, bigint, text, text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.get_license_delivery(text) to service_role;
grant execute on function public.mark_license_revealed(text) to service_role;
grant execute on function public.activate_paid_license(text, uuid, text, text) to service_role;
grant execute on function public.validate_paid_activation(text, uuid) to service_role;
grant execute on function public.planner_login(text, text, text, uuid) to anon, authenticated;
grant select, update on public.license_settings to service_role;
