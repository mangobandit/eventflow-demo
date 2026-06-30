-- Let guests open their check-in by selecting their household/name from a dropdown.
-- The raw invite tokens remain supported, but the public page can now use an
-- opaque lookup key instead of requiring guests to paste a 48-character code.

alter table public.rsvp_invitations
  add column if not exists public_lookup_key text;

alter table public.rsvp_invitations
  alter column public_lookup_key set default encode(gen_random_bytes(16), 'hex');

update public.rsvp_invitations
set public_lookup_key = encode(gen_random_bytes(16), 'hex')
where public_lookup_key is null;

alter table public.rsvp_invitations
  alter column public_lookup_key set not null;

create unique index if not exists rsvp_invitations_public_lookup_key_idx
  on public.rsvp_invitations(public_lookup_key);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rsvp_invitations_public_lookup_key_format'
      and conrelid = 'public.rsvp_invitations'::regclass
  ) then
    alter table public.rsvp_invitations
      add constraint rsvp_invitations_public_lookup_key_format
      check (public_lookup_key ~ '^[0-9a-f]{32}$');
  end if;
end $$;

create or replace function public.rsvp_invitation_payload(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invitation public.rsvp_invitations%rowtype;
  v_people jsonb;
begin
  select * into v_invitation
  from public.rsvp_invitations
  where id = p_invitation_id
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

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
    'lookup_key', v_invitation.public_lookup_key,
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

create or replace function public.list_guest_checkin_options()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_options jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lookup_key', i.public_lookup_key,
      'label', i.label,
      'celebration', i.celebration,
      'guest_count', coalesce(p.people_count, 0)
    ) order by i.celebration, lower(i.label), i.label
  ), '[]'::jsonb)
  into v_options
  from public.rsvp_invitations i
  left join lateral (
    select count(*)::int as people_count
    from public.rsvp_people p
    where p.invitation_id = i.id
  ) p on true
  where i.revoked_at is null
    and (i.expires_at is null or i.expires_at > now());

  return v_options;
end;
$$;

create or replace function public.get_rsvp_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invitation_id uuid;
begin
  p_token := lower(btrim(coalesce(p_token, '')));
  if p_token !~ '^[0-9a-f]{48}$' then
    return null;
  end if;

  select id into v_invitation_id
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
  where id = v_invitation_id;

  return public.rsvp_invitation_payload(v_invitation_id);
end;
$$;

create or replace function public.get_rsvp_invitation_by_lookup(p_lookup_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invitation_id uuid;
begin
  p_lookup_key := lower(btrim(coalesce(p_lookup_key, '')));
  if p_lookup_key !~ '^[0-9a-f]{32}$' then
    return null;
  end if;

  select id into v_invitation_id
  from public.rsvp_invitations
  where public_lookup_key = p_lookup_key
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  update public.rsvp_invitations
  set opened_at = coalesce(opened_at, now()),
      status = case when status in ('draft', 'sent') then 'opened' else status end
  where id = v_invitation_id;

  return public.rsvp_invitation_payload(v_invitation_id);
end;
$$;

create or replace function public.submit_rsvp_for_invitation(
  p_invitation_id uuid,
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
  if jsonb_typeof(coalesce(p_people, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid RSVP response';
  end if;

  select * into v_invitation
  from public.rsvp_invitations
  where id = p_invitation_id
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
    concat_ws(' - ', nullif(btrim(p_contact_email), ''), nullif(btrim(p_contact_phone), '')),
    concat_ws(' - ', p.notes, nullif(btrim(p_guest_message), '')),
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
      'lookup_key', v_invitation.public_lookup_key,
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
  v_invitation_id uuid;
begin
  p_token := lower(btrim(coalesce(p_token, '')));
  if p_token !~ '^[0-9a-f]{48}$' then
    raise exception 'Invalid invitation token' using errcode = '22023';
  end if;

  select id into v_invitation_id
  from public.rsvp_invitations
  where token_hash = digest(p_token, 'sha256')
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    raise exception 'Invitation is unavailable' using errcode = '22023';
  end if;

  return public.submit_rsvp_for_invitation(
    v_invitation_id,
    p_people,
    p_contact_email,
    p_contact_phone,
    p_guest_message
  );
end;
$$;

create or replace function public.submit_rsvp_by_lookup(
  p_lookup_key text,
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
  v_invitation_id uuid;
begin
  p_lookup_key := lower(btrim(coalesce(p_lookup_key, '')));
  if p_lookup_key !~ '^[0-9a-f]{32}$' then
    raise exception 'Invalid guest selection' using errcode = '22023';
  end if;

  select id into v_invitation_id
  from public.rsvp_invitations
  where public_lookup_key = p_lookup_key
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    raise exception 'Invitation is unavailable' using errcode = '22023';
  end if;

  return public.submit_rsvp_for_invitation(
    v_invitation_id,
    p_people,
    p_contact_email,
    p_contact_phone,
    p_guest_message
  );
end;
$$;

revoke all on function public.rsvp_invitation_payload(uuid) from public, anon, authenticated;
revoke all on function public.submit_rsvp_for_invitation(uuid, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.list_guest_checkin_options() from public, anon, authenticated;
revoke all on function public.get_rsvp_invitation_by_lookup(text) from public, anon, authenticated;
revoke all on function public.submit_rsvp_by_lookup(text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.get_rsvp_invitation(text) from public, anon, authenticated;
revoke all on function public.submit_rsvp(text, jsonb, text, text, text) from public, anon, authenticated;

grant execute on function public.list_guest_checkin_options() to anon, authenticated;
grant execute on function public.get_rsvp_invitation_by_lookup(text) to anon, authenticated;
grant execute on function public.submit_rsvp_by_lookup(text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.get_rsvp_invitation(text) to anon, authenticated;
grant execute on function public.submit_rsvp(text, jsonb, text, text, text) to anon, authenticated;
