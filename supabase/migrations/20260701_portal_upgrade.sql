-- Portal upgrade: honeymoon persistence, sliding sessions, structured
-- error codes and optimistic-concurrency saves.
--
-- Apply after 20260630_planner_username_login.sql. The web client deploys
-- safely in either order: it falls back to the previous RPC signature and
-- legacy error messages until this migration is live.

-- ---------------------------------------------------------------------------
-- 1. Honeymoon items move from browser localStorage into the secure planner.
-- ---------------------------------------------------------------------------

create table if not exists public.honeymoon_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'task'
    check (kind in ('setting', 'task', 'itinerary', 'flight', 'place', 'budget')),
  title text not null,
  detail text,
  notes text,
  status text,
  priority text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  done boolean not null default false,
  currency text not null default 'EUR' check (currency in ('EUR', 'ZAR', 'JPY')),
  amount numeric(12, 2),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists honeymoon_items_kind_idx
  on public.honeymoon_items(kind, sort_order, created_at);

drop trigger if exists set_honeymoon_items_updated_at on public.honeymoon_items;
create trigger set_honeymoon_items_updated_at
before update on public.honeymoon_items
for each row execute function public.set_updated_at();

alter table public.honeymoon_items enable row level security;

drop policy if exists "Owners can select honeymoon_items" on public.honeymoon_items;
drop policy if exists "Owners can insert honeymoon_items" on public.honeymoon_items;
drop policy if exists "Owners can update honeymoon_items" on public.honeymoon_items;
drop policy if exists "Owners can delete honeymoon_items" on public.honeymoon_items;
create policy "Owners can select honeymoon_items" on public.honeymoon_items
  for select to authenticated using (public.is_wedding_owner());
create policy "Owners can insert honeymoon_items" on public.honeymoon_items
  for insert to authenticated with check (public.is_wedding_owner());
create policy "Owners can update honeymoon_items" on public.honeymoon_items
  for update to authenticated using (public.is_wedding_owner()) with check (public.is_wedding_owner());
create policy "Owners can delete honeymoon_items" on public.honeymoon_items
  for delete to authenticated using (public.is_wedding_owner());

revoke all on public.honeymoon_items from public, anon;
grant select, insert, update, delete on public.honeymoon_items to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sliding session renewal: any authenticated call keeps the session alive.
-- ---------------------------------------------------------------------------

create or replace function public.require_planner_session(p_session_token text)
returns public.planner_users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := lower(btrim(coalesce(p_session_token, '')));
  v_user public.planner_users%rowtype;
begin
  if v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'PLANNER_SESSION_EXPIRED' using errcode = '28000';
  end if;

  select u.* into v_user
  from public.planner_sessions s
  join public.planner_users u on u.username = s.username
  where s.token_hash = digest(v_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
    and u.enabled is true
  limit 1;

  if not found then
    raise exception 'PLANNER_SESSION_EXPIRED' using errcode = '28000';
  end if;

  update public.planner_sessions
  set last_seen_at = now(),
      expires_at = greatest(expires_at, now() + interval '12 hours')
  where token_hash = digest(v_token, 'sha256');

  return v_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Structured error codes for login.
-- ---------------------------------------------------------------------------

create or replace function public.planner_login(p_username text, p_password text)
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
    raise exception 'PLANNER_INVALID_CREDENTIALS' using errcode = '28000';
  end if;

  if v_user.locked_until is not null and v_user.locked_until > now() then
    raise exception 'PLANNER_LOCKED' using errcode = '28000';
  end if;

  if crypt(v_password, v_user.password_hash) <> v_user.password_hash then
    update public.planner_users
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= 8 then now() + interval '15 minutes' else locked_until end
    where username = v_user.username;
    perform pg_sleep(0.25);
    raise exception 'PLANNER_INVALID_CREDENTIALS' using errcode = '28000';
  end if;

  update public.planner_users
  set failed_attempts = 0,
      locked_until = null
  where username = v_user.username;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.planner_sessions (username, token_hash, expires_at)
  values (v_user.username, digest(v_token, 'sha256'), v_expires_at);

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

-- ---------------------------------------------------------------------------
-- 4. planner_load_all now includes honeymoon items.
-- ---------------------------------------------------------------------------

create or replace function public.planner_load_all(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.planner_users%rowtype;
begin
  v_user := public.require_planner_session(p_session_token);
  return jsonb_build_object(
    'identity', jsonb_build_object(
      'username', v_user.username,
      'planner_person', v_user.planner_person,
      'display_name', v_user.display_name
    ),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.updated_at desc) from public.tasks t), '[]'::jsonb),
    'budget_items', coalesce((select jsonb_agg(to_jsonb(b) order by b.updated_at desc) from public.budget_items b), '[]'::jsonb),
    'guests', coalesce((select jsonb_agg(to_jsonb(g) order by g.updated_at desc) from public.guests g), '[]'::jsonb),
    'vendors', coalesce((select jsonb_agg(to_jsonb(v) order by v.updated_at desc) from public.vendors v), '[]'::jsonb),
    'timeline_items', coalesce((select jsonb_agg(to_jsonb(ti) order by ti.item_date asc, ti.item_time asc nulls last) from public.timeline_items ti), '[]'::jsonb),
    'content_blocks', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order asc, c.updated_at desc) from public.content_blocks c), '[]'::jsonb),
    'honeymoon_items', coalesce((select jsonb_agg(to_jsonb(h) order by h.sort_order asc, h.created_at asc) from public.honeymoon_items h), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. planner_save_entity: honeymoon branch, optimistic concurrency, guest
--    check-in corrections, structured errors. The old 4-argument signature is
--    preserved via the defaulted parameter.
-- ---------------------------------------------------------------------------

drop function if exists public.planner_save_entity(text, text, uuid, jsonb);

create or replace function public.planner_save_entity(
  p_session_token text,
  p_table text,
  p_record_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.planner_users%rowtype;
  v_table text := lower(btrim(coalesce(p_table, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_id uuid;
  v_result jsonb;
  v_current_updated_at timestamptz;
begin
  v_user := public.require_planner_session(p_session_token);

  if v_table not in ('tasks', 'budget_items', 'guests', 'vendors', 'timeline_items', 'content_blocks', 'honeymoon_items') then
    raise exception 'PLANNER_UNSUPPORTED_TABLE' using errcode = '22023';
  end if;

  if p_record_id is not null then
    execute format('select updated_at from public.%I where id = $1', v_table)
    into v_current_updated_at using p_record_id;
    if v_current_updated_at is null then
      raise exception 'PLANNER_RECORD_NOT_FOUND' using errcode = '22023';
    end if;
    if p_expected_updated_at is not null and v_current_updated_at <> p_expected_updated_at then
      raise exception 'PLANNER_CONFLICT' using errcode = '40001';
    end if;
  end if;

  if v_table = 'tasks' then
    if p_record_id is null then
      insert into public.tasks (title, description, owner, celebration, category, priority, due_date, status, notes)
      values (
        coalesce(nullif(btrim(v_payload ->> 'title'), ''), 'Untitled task'),
        nullif(btrim(v_payload ->> 'description'), ''),
        coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
        coalesce(nullif(btrim(v_payload ->> 'celebration'), ''), 'shared'),
        nullif(btrim(v_payload ->> 'category'), ''),
        coalesce(nullif(btrim(v_payload ->> 'priority'), ''), 'normal'),
        nullif(v_payload ->> 'due_date', '')::date,
        coalesce(nullif(btrim(v_payload ->> 'status'), ''), 'outstanding'),
        nullif(btrim(v_payload ->> 'notes'), '')
      ) returning id into v_id;
    else
      update public.tasks
      set title = coalesce(nullif(btrim(v_payload ->> 'title'), ''), title),
          description = nullif(btrim(v_payload ->> 'description'), ''),
          owner = coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
          celebration = coalesce(nullif(btrim(v_payload ->> 'celebration'), ''), 'shared'),
          category = nullif(btrim(v_payload ->> 'category'), ''),
          priority = coalesce(nullif(btrim(v_payload ->> 'priority'), ''), 'normal'),
          due_date = nullif(v_payload ->> 'due_date', '')::date,
          status = coalesce(nullif(btrim(v_payload ->> 'status'), ''), 'outstanding'),
          notes = nullif(btrim(v_payload ->> 'notes'), '')
      where id = p_record_id
      returning id into v_id;
    end if;
    select to_jsonb(t) into v_result from public.tasks t where t.id = v_id;

  elsif v_table = 'budget_items' then
    if p_record_id is null then
      insert into public.budget_items (title, owner, celebration, category, currency, estimated, deposit, paid, due_date, status, notes)
      values (
        coalesce(nullif(btrim(v_payload ->> 'title'), ''), 'Untitled item'),
        coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
        coalesce(nullif(btrim(v_payload ->> 'celebration'), ''), 'shared'),
        nullif(btrim(v_payload ->> 'category'), ''),
        coalesce(nullif(btrim(v_payload ->> 'currency'), ''), 'EUR'),
        coalesce(nullif(v_payload ->> 'estimated', '')::numeric, 0),
        coalesce(nullif(v_payload ->> 'deposit', '')::numeric, 0),
        coalesce(nullif(v_payload ->> 'paid', '')::numeric, 0),
        nullif(v_payload ->> 'due_date', '')::date,
        coalesce(nullif(btrim(v_payload ->> 'status'), ''), 'outstanding'),
        nullif(btrim(v_payload ->> 'notes'), '')
      ) returning id into v_id;
    else
      update public.budget_items
      set title = coalesce(nullif(btrim(v_payload ->> 'title'), ''), title),
          owner = coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
          celebration = coalesce(nullif(btrim(v_payload ->> 'celebration'), ''), 'shared'),
          category = nullif(btrim(v_payload ->> 'category'), ''),
          currency = coalesce(nullif(btrim(v_payload ->> 'currency'), ''), 'EUR'),
          estimated = coalesce(nullif(v_payload ->> 'estimated', '')::numeric, 0),
          deposit = coalesce(nullif(v_payload ->> 'deposit', '')::numeric, 0),
          paid = coalesce(nullif(v_payload ->> 'paid', '')::numeric, 0),
          due_date = nullif(v_payload ->> 'due_date', '')::date,
          status = coalesce(nullif(btrim(v_payload ->> 'status'), ''), 'outstanding'),
          notes = nullif(btrim(v_payload ->> 'notes'), '')
      where id = p_record_id
      returning id into v_id;
    end if;
    select to_jsonb(b) into v_result from public.budget_items b where b.id = v_id;

  elsif v_table = 'guests' then
    if p_record_id is null then
      insert into public.guests (name, party_name, owner, celebration, rsvp_status, dietary, transport, accommodation, contact, notes, check_in_status)
      values (
        coalesce(nullif(btrim(v_payload ->> 'name'), ''), 'Unnamed guest'),
        nullif(btrim(v_payload ->> 'party_name'), ''),
        coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
        coalesce(nullif(btrim(v_payload ->> 'celebration'), ''), 'spain'),
        coalesce(nullif(btrim(v_payload ->> 'rsvp_status'), ''), 'no_response'),
        nullif(btrim(v_payload ->> 'dietary'), ''),
        nullif(btrim(v_payload ->> 'transport'), ''),
        nullif(btrim(v_payload ->> 'accommodation'), ''),
        nullif(btrim(v_payload ->> 'contact'), ''),
        nullif(btrim(v_payload ->> 'notes'), ''),
        coalesce(nullif(btrim(v_payload ->> 'check_in_status'), ''), 'not_checked_in')
      ) returning id into v_id;
    else
      update public.guests
      set name = coalesce(nullif(btrim(v_payload ->> 'name'), ''), name),
          party_name = nullif(btrim(v_payload ->> 'party_name'), ''),
          owner = coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
          celebration = coalesce(nullif(btrim(v_payload ->> 'celebration'), ''), 'spain'),
          rsvp_status = coalesce(nullif(btrim(v_payload ->> 'rsvp_status'), ''), 'no_response'),
          dietary = nullif(btrim(v_payload ->> 'dietary'), ''),
          transport = nullif(btrim(v_payload ->> 'transport'), ''),
          accommodation = nullif(btrim(v_payload ->> 'accommodation'), ''),
          contact = nullif(btrim(v_payload ->> 'contact'), ''),
          notes = nullif(btrim(v_payload ->> 'notes'), ''),
          check_in_status = coalesce(nullif(btrim(v_payload ->> 'check_in_status'), ''), check_in_status)
      where id = p_record_id
      returning id into v_id;
    end if;
    select to_jsonb(g) into v_result from public.guests g where g.id = v_id;

  elsif v_table = 'vendors' then
    if p_record_id is null then
      insert into public.vendors (name, owner, celebration, category, contact_name, email, phone, currency, quote_amount, next_action, due_date, status, notes)
      values (
        coalesce(nullif(btrim(v_payload ->> 'name'), ''), 'Unnamed supplier'),
        coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
        coalesce(nullif(btrim(v_payload ->> 'celebration'), ''), 'shared'),
        nullif(btrim(v_payload ->> 'category'), ''),
        nullif(btrim(v_payload ->> 'contact_name'), ''),
        nullif(btrim(v_payload ->> 'email'), ''),
        nullif(btrim(v_payload ->> 'phone'), ''),
        coalesce(nullif(btrim(v_payload ->> 'currency'), ''), 'EUR'),
        nullif(v_payload ->> 'quote_amount', '')::numeric,
        nullif(btrim(v_payload ->> 'next_action'), ''),
        nullif(v_payload ->> 'due_date', '')::date,
        coalesce(nullif(btrim(v_payload ->> 'status'), ''), 'outstanding'),
        nullif(btrim(v_payload ->> 'notes'), '')
      ) returning id into v_id;
    else
      update public.vendors
      set name = coalesce(nullif(btrim(v_payload ->> 'name'), ''), name),
          owner = coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
          celebration = coalesce(nullif(btrim(v_payload ->> 'celebration'), ''), 'shared'),
          category = nullif(btrim(v_payload ->> 'category'), ''),
          contact_name = nullif(btrim(v_payload ->> 'contact_name'), ''),
          email = nullif(btrim(v_payload ->> 'email'), ''),
          phone = nullif(btrim(v_payload ->> 'phone'), ''),
          currency = coalesce(nullif(btrim(v_payload ->> 'currency'), ''), 'EUR'),
          quote_amount = nullif(v_payload ->> 'quote_amount', '')::numeric,
          next_action = nullif(btrim(v_payload ->> 'next_action'), ''),
          due_date = nullif(v_payload ->> 'due_date', '')::date,
          status = coalesce(nullif(btrim(v_payload ->> 'status'), ''), 'outstanding'),
          notes = nullif(btrim(v_payload ->> 'notes'), '')
      where id = p_record_id
      returning id into v_id;
    end if;
    select to_jsonb(v) into v_result from public.vendors v where v.id = v_id;

  elsif v_table = 'timeline_items' then
    if p_record_id is null then
      insert into public.timeline_items (title, owner, celebration, item_date, item_time, audience, location, sort_order, status, notes)
      values (
        coalesce(nullif(btrim(v_payload ->> 'title'), ''), 'Untitled milestone'),
        coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
        coalesce(nullif(btrim(v_payload ->> 'celebration'), ''), 'shared'),
        coalesce(nullif(v_payload ->> 'item_date', '')::date, current_date),
        nullif(v_payload ->> 'item_time', '')::time,
        coalesce(nullif(btrim(v_payload ->> 'audience'), ''), 'private'),
        nullif(btrim(v_payload ->> 'location'), ''),
        coalesce(nullif(v_payload ->> 'sort_order', '')::integer, 0),
        coalesce(nullif(btrim(v_payload ->> 'status'), ''), 'outstanding'),
        nullif(btrim(v_payload ->> 'notes'), '')
      ) returning id into v_id;
    else
      update public.timeline_items
      set title = coalesce(nullif(btrim(v_payload ->> 'title'), ''), title),
          owner = coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
          celebration = coalesce(nullif(btrim(v_payload ->> 'celebration'), ''), 'shared'),
          item_date = coalesce(nullif(v_payload ->> 'item_date', '')::date, item_date),
          item_time = nullif(v_payload ->> 'item_time', '')::time,
          audience = coalesce(nullif(btrim(v_payload ->> 'audience'), ''), 'private'),
          location = nullif(btrim(v_payload ->> 'location'), ''),
          sort_order = coalesce(nullif(v_payload ->> 'sort_order', '')::integer, 0),
          status = coalesce(nullif(btrim(v_payload ->> 'status'), ''), 'outstanding'),
          notes = nullif(btrim(v_payload ->> 'notes'), '')
      where id = p_record_id
      returning id into v_id;
    end if;
    select to_jsonb(ti) into v_result from public.timeline_items ti where ti.id = v_id;

  elsif v_table = 'content_blocks' then
    if p_record_id is null then
      insert into public.content_blocks (slug, section, country, title, body, owner, sort_order, published, publish_at)
      values (
        coalesce(nullif(btrim(v_payload ->> 'slug'), ''), 'update-' || extract(epoch from now())::bigint),
        coalesce(nullif(btrim(v_payload ->> 'section'), ''), 'general'),
        coalesce(nullif(btrim(v_payload ->> 'country'), ''), 'both'),
        coalesce(nullif(btrim(v_payload ->> 'title'), ''), 'Untitled update'),
        coalesce(nullif(btrim(v_payload ->> 'body'), ''), ''),
        coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
        coalesce(nullif(v_payload ->> 'sort_order', '')::integer, 0),
        coalesce((v_payload ->> 'published')::boolean, false),
        nullif(v_payload ->> 'publish_at', '')::timestamptz
      ) returning id into v_id;
    else
      update public.content_blocks
      set slug = coalesce(nullif(btrim(v_payload ->> 'slug'), ''), slug),
          section = coalesce(nullif(btrim(v_payload ->> 'section'), ''), 'general'),
          country = coalesce(nullif(btrim(v_payload ->> 'country'), ''), 'both'),
          title = coalesce(nullif(btrim(v_payload ->> 'title'), ''), title),
          body = coalesce(nullif(btrim(v_payload ->> 'body'), ''), ''),
          owner = coalesce(nullif(btrim(v_payload ->> 'owner'), ''), 'shared'),
          sort_order = coalesce(nullif(v_payload ->> 'sort_order', '')::integer, 0),
          published = coalesce((v_payload ->> 'published')::boolean, false),
          publish_at = nullif(v_payload ->> 'publish_at', '')::timestamptz
      where id = p_record_id
      returning id into v_id;
    end if;
    select to_jsonb(c) into v_result from public.content_blocks c where c.id = v_id;

  elsif v_table = 'honeymoon_items' then
    if p_record_id is null then
      insert into public.honeymoon_items (kind, title, detail, notes, status, priority, done, currency, amount, sort_order)
      values (
        coalesce(nullif(btrim(v_payload ->> 'kind'), ''), 'task'),
        coalesce(nullif(btrim(v_payload ->> 'title'), ''), 'Untitled honeymoon item'),
        nullif(btrim(v_payload ->> 'detail'), ''),
        nullif(btrim(v_payload ->> 'notes'), ''),
        nullif(btrim(v_payload ->> 'status'), ''),
        coalesce(nullif(btrim(v_payload ->> 'priority'), ''), 'normal'),
        coalesce((v_payload ->> 'done')::boolean, false),
        coalesce(nullif(btrim(v_payload ->> 'currency'), ''), 'EUR'),
        nullif(v_payload ->> 'amount', '')::numeric,
        coalesce(nullif(v_payload ->> 'sort_order', '')::integer, 0)
      ) returning id into v_id;
    else
      update public.honeymoon_items
      set kind = coalesce(nullif(btrim(v_payload ->> 'kind'), ''), kind),
          title = coalesce(nullif(btrim(v_payload ->> 'title'), ''), title),
          detail = nullif(btrim(v_payload ->> 'detail'), ''),
          notes = nullif(btrim(v_payload ->> 'notes'), ''),
          status = nullif(btrim(v_payload ->> 'status'), ''),
          priority = coalesce(nullif(btrim(v_payload ->> 'priority'), ''), 'normal'),
          done = coalesce((v_payload ->> 'done')::boolean, false),
          currency = coalesce(nullif(btrim(v_payload ->> 'currency'), ''), 'EUR'),
          amount = nullif(v_payload ->> 'amount', '')::numeric,
          sort_order = coalesce(nullif(v_payload ->> 'sort_order', '')::integer, 0)
      where id = p_record_id
      returning id into v_id;
    end if;
    select to_jsonb(h) into v_result from public.honeymoon_items h where h.id = v_id;
  end if;

  if v_id is null then
    raise exception 'PLANNER_RECORD_NOT_FOUND' using errcode = '22023';
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. planner_delete_entity gains the honeymoon table and structured errors.
-- ---------------------------------------------------------------------------

create or replace function public.planner_delete_entity(p_session_token text, p_table text, p_record_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.planner_users%rowtype;
  v_table text := lower(btrim(coalesce(p_table, '')));
begin
  v_user := public.require_planner_session(p_session_token);

  if v_table not in ('tasks', 'budget_items', 'guests', 'vendors', 'timeline_items', 'content_blocks', 'honeymoon_items') then
    raise exception 'PLANNER_UNSUPPORTED_TABLE' using errcode = '22023';
  end if;

  execute format('delete from public.%I where id = $1', v_table) using p_record_id;

  if not found then
    raise exception 'PLANNER_RECORD_NOT_FOUND' using errcode = '22023';
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Lock function privileges down again after recreation.
-- ---------------------------------------------------------------------------

revoke all on function public.require_planner_session(text) from public, anon, authenticated;
revoke all on function public.planner_login(text, text) from public;
revoke all on function public.planner_load_all(text) from public;
revoke all on function public.planner_save_entity(text, text, uuid, jsonb, timestamptz) from public;
revoke all on function public.planner_delete_entity(text, text, uuid) from public;

grant execute on function public.planner_login(text, text) to anon, authenticated;
grant execute on function public.planner_load_all(text) to anon, authenticated;
grant execute on function public.planner_save_entity(text, text, uuid, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.planner_delete_entity(text, text, uuid) to anon, authenticated;
