-- RSVP Control Centre for mxcwedding.com
-- Apply after supabase/schema.sql.
--
-- Security model:
--   * Matt and Cara authenticate through the existing allowed_users allowlist.
--   * Private invitation tables are never readable by anon.
--   * Guests can only call two SECURITY DEFINER RPCs with a 192-bit random token.
--   * Only a SHA-256 hash and a six-character hint are stored; raw tokens are returned once.
--   * Guest responses are synchronized into the existing private guests table.

create extension if not exists pgcrypto;

create table if not exists public.rsvp_invitations (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 120),
  owner text not null default 'shared' check (owner in ('shared', 'matt', 'cara')),
  celebration text not null check (celebration in ('spain', 'south_africa')),
  token_hash bytea not null unique,
  token_hint text not null check (char_length(token_hint) = 6),
  status text not null default 'draft' check (status in ('draft', 'sent', 'opened', 'responded', 'revoked')),
  contact_email text check (contact_email is null or char_length(contact_email) <= 200),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 80),
  guest_message text check (guest_message is null or char_length(guest_message) <= 2000),
  deadline date,
  sent_at timestamptz,
  opened_at timestamptz,
  submitted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 4000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rsvp_people (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.rsvp_invitations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  attending boolean,
  dietary text check (dietary is null or char_length(dietary) <= 800),
  transport_needed boolean,
  transport_location text check (transport_location is null or char_length(transport_location) <= 300),
  accommodation text check (accommodation is null or char_length(accommodation) <= 300),
  notes text check (notes is null or char_length(notes) <= 800),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rsvp_invitations_owner_idx on public.rsvp_invitations(owner, celebration, status);
create index if not exists rsvp_invitations_deadline_idx on public.rsvp_invitations(deadline) where revoked_at is null;
create index if not exists rsvp_people_invitation_idx on public.rsvp_people(invitation_id, sort_order);

alter table public.guests add column if not exists rsvp_invitation_id uuid;
alter table public.guests add column if not exists rsvp_person_id uuid;
create unique index if not exists guests_rsvp_person_unique
  on public.guests(rsvp_person_id)
  where rsvp_person_id is not null;

-- Foreign keys are added idempotently because ALTER TABLE ... ADD CONSTRAINT
-- does not support IF NOT EXISTS on all supported PostgreSQL versions.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'guests_rsvp_invitation_id_fkey'
      and conrelid = 'public.guests'::regclass
  ) then
    alter table public.guests
      add constraint guests_rsvp_invitation_id_fkey
      foreign key (rsvp_invitation_id)
      references public.rsvp_invitations(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'guests_rsvp_person_id_fkey'
      and conrelid = 'public.guests'::regclass
  ) then
    alter table public.guests
      add constraint guests_rsvp_person_id_fkey
      foreign key (rsvp_person_id)
      references public.rsvp_people(id)
      on delete set null;
  end if;
end $$;

-- Reuse the existing updated_at trigger helper from supabase/schema.sql.
drop trigger if exists set_rsvp_invitations_updated_at on public.rsvp_invitations;
create trigger set_rsvp_invitations_updated_at
before update on public.rsvp_invitations
for each row execute function public.set_updated_at();

drop trigger if exists set_rsvp_people_updated_at on public.rsvp_people;
create trigger set_rsvp_people_updated_at
before update on public.rsvp_people
for each row execute function public.set_updated_at();

alter table public.rsvp_invitations enable row level security;
alter table public.rsvp_people enable row level security;

drop policy if exists "Owners can select RSVP invitations" on public.rsvp_invitations;
drop policy if exists "Owners can insert RSVP invitations" on public.rsvp_invitations;
drop policy if exists "Owners can update RSVP invitations" on public.rsvp_invitations;
drop policy if exists "Owners can delete RSVP invitations" on public.rsvp_invitations;
create policy "Owners can select RSVP invitations"
on public.rsvp_invitations for select to authenticated
using (public.is_wedding_owner());
create policy "Owners can insert RSVP invitations"
on public.rsvp_invitations for insert to authenticated
with check (public.is_wedding_owner());
create policy "Owners can update RSVP invitations"
on public.rsvp_invitations for update to authenticated
using (public.is_wedding_owner()) with check (public.is_wedding_owner());
create policy "Owners can delete RSVP invitations"
on public.rsvp_invitations for delete to authenticated
using (public.is_wedding_owner());

drop policy if exists "Owners can select RSVP people" on public.rsvp_people;
drop policy if exists "Owners can insert RSVP people" on public.rsvp_people;
drop policy if exists "Owners can update RSVP people" on public.rsvp_people;
drop policy if exists "Owners can delete RSVP people" on public.rsvp_people;
create policy "Owners can select RSVP people"
on public.rsvp_people for select to authenticated
using (public.is_wedding_owner());
create policy "Owners can insert RSVP people"
on public.rsvp_people for insert to authenticated
with check (public.is_wedding_owner());
create policy "Owners can update RSVP people"
on public.rsvp_people for update to authenticated
using (public.is_wedding_owner()) with check (public.is_wedding_owner());
create policy "Owners can delete RSVP people"
on public.rsvp_people for delete to authenticated
using (public.is_wedding_owner());

create or replace function public.create_rsvp_invitation(
  p_label text,
  p_celebration text,
  p_people jsonb,
  p_owner text default 'shared',
  p_deadline date default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_notes text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_invitation_id uuid;
  v_person jsonb;
  v_name text;
  v_count integer := 0;
begin
  if not public.is_wedding_owner() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  p_label := nullif(btrim(p_label), '');
  p_owner := lower(coalesce(p_owner, 'shared'));
  p_celebration := lower(coalesce(p_celebration, ''));

  if p_label is null or char_length(p_label) > 120 then
    raise exception 'Invitation label is required and must be 120 characters or fewer';
  end if;
  if p_owner not in ('shared', 'matt', 'cara') then
    raise exception 'Invalid planner owner';
  end if;
  if p_celebration not in ('spain', 'south_africa') then
    raise exception 'Invalid celebration';
  end if;
  if jsonb_typeof(coalesce(p_people, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_people, '[]'::jsonb)) < 1
     or jsonb_array_length(coalesce(p_people, '[]'::jsonb)) > 20 then
    raise exception 'Add between 1 and 20 invited people';
  end if;

  insert into public.rsvp_invitations (
    label, owner, celebration, token_hash, token_hint, contact_email,
    contact_phone, deadline, expires_at, notes, created_by
  ) values (
    left(p_label, 120), p_owner, p_celebration,
    digest(v_token, 'sha256'), right(v_token, 6),
    left(nullif(btrim(p_contact_email), ''), 200),
    left(nullif(btrim(p_contact_phone), ''), 80),
    p_deadline, p_expires_at, left(nullif(btrim(p_notes), ''), 4000), auth.uid()
  ) returning id into v_invitation_id;

  for v_person in select value from jsonb_array_elements(p_people)
  loop
    v_name := nullif(btrim(v_person ->> 'name'), '');
    if v_name is null or char_length(v_name) > 160 then
      raise exception 'Every invited person needs a valid name of 160 characters or fewer';
    end if;
    insert into public.rsvp_people (invitation_id, name, sort_order)
    values (v_invitation_id, v_name, v_count);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'id', v_invitation_id,
    'token', v_token,
    'token_hint', right(v_token, 6)
  );
end;
$$;

create or replace function public.get_rsvp_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invitation public.rsvp_invitations%rowtype;
  v_people jsonb;
begin
  p_token := lower(btrim(coalesce(p_token, '')));
  if p_token !~ '^[0-9a-f]{48}$' then
    return null;
  end if;

  select * into v_invitation
  from public.rsvp_invitations
  where token_hash = digest(p_token, 'sha256')
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  update public.rsvp_invitations
  set opened_at = coalesce(opened_at, now()),
      status = case when status in ('draft', 'sent') then 'opened' else status end
  where id = v_invitation.id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'attending', p.attending,
      'dietary', p.dietary,
      'transport_needed', p.transport_needed,
      'transport_location', p.transport_location,
      'accommodation', p.accommodation,
      'notes', p.notes,
      'sort_order', p.sort_order
    ) order by p.sort_order, p.created_at
  ), '[]'::jsonb)
  into v_people
  from public.rsvp_people p
  where p.invitation_id = v_invitation.id;

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'label', v_invitation.label,
    'celebration', v_invitation.celebration,
    'deadline', v_invitation.deadline,
    'submitted_at', v_invitation.submitted_at,
    'contact_email', v_invitation.contact_email,
    'contact_phone', v_invitation.contact_phone,
    'guest_message', v_invitation.guest_message,
    'people', v_people
  );
end;
$$;

create or replace function public.submit_rsvp(
  p_token text,
  p_people jsonb,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_guest_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invitation public.rsvp_invitations%rowtype;
  v_person jsonb;
  v_person_id uuid;
  v_expected integer;
  v_updated integer := 0;
  v_attending boolean;
  v_transport boolean;
  v_people jsonb;
  v_attending_count integer;
  v_declined_count integer;
begin
  p_token := lower(btrim(coalesce(p_token, '')));
  if p_token !~ '^[0-9a-f]{48}$' then
    raise exception 'Invalid invitation token' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_people, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid RSVP response';
  end if;

  select * into v_invitation
  from public.rsvp_invitations
  where token_hash = digest(p_token, 'sha256')
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'Invitation is unavailable' using errcode = '22023';
  end if;

  select count(*) into v_expected
  from public.rsvp_people
  where invitation_id = v_invitation.id;

  if jsonb_array_length(p_people) <> v_expected then
    raise exception 'A response is required for every invited person';
  end if;

  for v_person in select value from jsonb_array_elements(p_people)
  loop
    begin
      v_person_id := (v_person ->> 'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid invited person';
    end;

    if not exists (
      select 1 from public.rsvp_people
      where id = v_person_id and invitation_id = v_invitation.id
    ) then
      raise exception 'Invalid invited person';
    end if;

    if not (v_person ? 'attending') or jsonb_typeof(v_person -> 'attending') <> 'boolean' then
      raise exception 'Choose yes or no for every invited person';
    end if;
    v_attending := (v_person ->> 'attending')::boolean;

    if v_person ? 'transport_needed' and jsonb_typeof(v_person -> 'transport_needed') = 'boolean' then
      v_transport := (v_person ->> 'transport_needed')::boolean;
    else
      v_transport := null;
    end if;

    update public.rsvp_people
    set attending = v_attending,
        dietary = left(nullif(btrim(v_person ->> 'dietary'), ''), 800),
        transport_needed = v_transport,
        transport_location = left(nullif(btrim(v_person ->> 'transport_location'), ''), 300),
        accommodation = left(nullif(btrim(v_person ->> 'accommodation'), ''), 300),
        notes = left(nullif(btrim(v_person ->> 'notes'), ''), 800)
    where id = v_person_id and invitation_id = v_invitation.id;

    v_updated := v_updated + 1;
  end loop;

  if v_updated <> v_expected then
    raise exception 'Incomplete RSVP response';
  end if;

  update public.rsvp_invitations
  set contact_email = left(nullif(btrim(p_contact_email), ''), 200),
      contact_phone = left(nullif(btrim(p_contact_phone), ''), 80),
      guest_message = left(nullif(btrim(p_guest_message), ''), 2000),
      submitted_at = now(),
      opened_at = coalesce(opened_at, now()),
      status = 'responded'
  where id = v_invitation.id;

  -- Keep the established private guest register automatically synchronized.
  insert into public.guests (
    name, party_name, owner, celebration, rsvp_status, dietary,
    transport, accommodation, contact, notes,
    rsvp_invitation_id, rsvp_person_id, created_by
  )
  select
    p.name,
    v_invitation.label,
    v_invitation.owner,
    v_invitation.celebration,
    case when p.attending then 'yes' else 'no' end,
    p.dietary,
    case
      when p.transport_needed is true then
        concat('Required', case when p.transport_location is not null then ': ' || p.transport_location else '' end)
      when p.transport_needed is false then 'Not required'
      else 'TBC'
    end,
    p.accommodation,
    concat_ws(' · ', nullif(btrim(p_contact_email), ''), nullif(btrim(p_contact_phone), '')),
    concat_ws(' · ', p.notes, nullif(btrim(p_guest_message), '')),
    v_invitation.id,
    p.id,
    v_invitation.created_by
  from public.rsvp_people p
  where p.invitation_id = v_invitation.id
  on conflict (rsvp_person_id) where rsvp_person_id is not null
  do update set
    name = excluded.name,
    party_name = excluded.party_name,
    owner = excluded.owner,
    celebration = excluded.celebration,
    rsvp_status = excluded.rsvp_status,
    dietary = excluded.dietary,
    transport = excluded.transport,
    accommodation = excluded.accommodation,
    contact = excluded.contact,
    notes = excluded.notes,
    rsvp_invitation_id = excluded.rsvp_invitation_id;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'attending', p.attending,
      'dietary', p.dietary,
      'transport_needed', p.transport_needed,
      'transport_location', p.transport_location,
      'accommodation', p.accommodation,
      'notes', p.notes,
      'sort_order', p.sort_order
    ) order by p.sort_order), '[]'::jsonb),
    count(*) filter (where p.attending is true),
    count(*) filter (where p.attending is false)
  into v_people, v_attending_count, v_declined_count
  from public.rsvp_people p
  where p.invitation_id = v_invitation.id;

  return jsonb_build_object(
    'ok', true,
    'summary', jsonb_build_object(
      'attending', v_attending_count,
      'declined', v_declined_count
    ),
    'invitation', jsonb_build_object(
      'invitation_id', v_invitation.id,
      'label', v_invitation.label,
      'celebration', v_invitation.celebration,
      'deadline', v_invitation.deadline,
      'submitted_at', now(),
      'contact_email', left(nullif(btrim(p_contact_email), ''), 200),
      'contact_phone', left(nullif(btrim(p_contact_phone), ''), 80),
      'guest_message', left(nullif(btrim(p_guest_message), ''), 2000),
      'people', v_people
    )
  );
end;
$$;

create or replace function public.rotate_rsvp_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if not public.is_wedding_owner() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  update public.rsvp_invitations
  set token_hash = digest(v_token, 'sha256'),
      token_hint = right(v_token, 6),
      revoked_at = null,
      opened_at = null,
      status = case when submitted_at is null then 'draft' else 'responded' end
  where id = p_invitation_id;

  if not found then
    raise exception 'Invitation not found';
  end if;

  return jsonb_build_object('id', p_invitation_id, 'token', v_token, 'token_hint', right(v_token, 6));
end;
$$;

create or replace function public.mark_rsvp_invitation_sent(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_wedding_owner() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  update public.rsvp_invitations
  set sent_at = coalesce(sent_at, now()),
      status = case when submitted_at is not null then 'responded' else 'sent' end
  where id = p_invitation_id and revoked_at is null;

  if not found then
    raise exception 'Invitation not found or revoked';
  end if;
end;
$$;

create or replace function public.revoke_rsvp_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_wedding_owner() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  update public.rsvp_invitations
  set revoked_at = now(), status = 'revoked'
  where id = p_invitation_id;

  if not found then
    raise exception 'Invitation not found';
  end if;
end;
$$;

create or replace function public.delete_rsvp_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_wedding_owner() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if not exists (select 1 from public.rsvp_invitations where id = p_invitation_id) then
    raise exception 'Invitation not found';
  end if;

  delete from public.guests where rsvp_invitation_id = p_invitation_id;
  delete from public.rsvp_invitations where id = p_invitation_id;
end;
$$;

-- Explicit privilege boundary. PostgreSQL grants function execution to PUBLIC
-- by default, so every RSVP function is revoked first and then narrowly granted.
revoke all on public.rsvp_invitations from anon;
revoke all on public.rsvp_people from anon;
revoke all on public.rsvp_invitations from public;
revoke all on public.rsvp_people from public;

grant select, insert, update, delete on public.rsvp_invitations to authenticated;
grant select, insert, update, delete on public.rsvp_people to authenticated;

revoke all on function public.create_rsvp_invitation(text, text, jsonb, text, date, text, text, text, timestamptz) from public;
revoke all on function public.get_rsvp_invitation(text) from public;
revoke all on function public.submit_rsvp(text, jsonb, text, text, text) from public;
revoke all on function public.rotate_rsvp_invitation(uuid) from public;
revoke all on function public.mark_rsvp_invitation_sent(uuid) from public;
revoke all on function public.revoke_rsvp_invitation(uuid) from public;
revoke all on function public.delete_rsvp_invitation(uuid) from public;

grant execute on function public.create_rsvp_invitation(text, text, jsonb, text, date, text, text, text, timestamptz) to authenticated;
grant execute on function public.rotate_rsvp_invitation(uuid) to authenticated;
grant execute on function public.mark_rsvp_invitation_sent(uuid) to authenticated;
grant execute on function public.revoke_rsvp_invitation(uuid) to authenticated;
grant execute on function public.delete_rsvp_invitation(uuid) to authenticated;
grant execute on function public.get_rsvp_invitation(text) to anon, authenticated;
grant execute on function public.submit_rsvp(text, jsonb, text, text, text) to anon, authenticated;
