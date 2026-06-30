-- Stamp 24-hour guest check-in confirmations into the private planner tables.
-- Safe to run after the RSVP control-centre and guest check-in field migrations.

alter table public.rsvp_invitations
  add column if not exists checked_in_at timestamptz,
  add column if not exists check_in_status text check (check_in_status is null or check_in_status in ('not_checked_in', 'checked_in', 'cant_make_it')),
  add column if not exists arrival_status text,
  add column if not exists eta text,
  add column if not exists last_confirmed_at timestamptz;

alter table public.guests
  add column if not exists checked_in_at timestamptz,
  add column if not exists check_in_status text check (check_in_status is null or check_in_status in ('not_checked_in', 'checked_in', 'cant_make_it')),
  add column if not exists arrival_status text,
  add column if not exists eta text,
  add column if not exists last_confirmed_at timestamptz;

create or replace function public.set_guest_checkin_from_rsvp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rsvp_person_id is not null and new.rsvp_status in ('yes', 'no') then
    new.last_confirmed_at := coalesce(new.last_confirmed_at, now());
    new.checked_in_at := coalesce(new.checked_in_at, new.last_confirmed_at, now());
    new.check_in_status := case
      when new.rsvp_status = 'yes' then 'checked_in'
      else 'cant_make_it'
    end;
  elsif new.rsvp_person_id is not null and coalesce(new.rsvp_status, 'no_response') in ('tbc', 'no_response') and new.check_in_status is null then
    new.check_in_status := 'not_checked_in';
  end if;

  return new;
end;
$$;

drop trigger if exists set_guest_checkin_from_rsvp on public.guests;
create trigger set_guest_checkin_from_rsvp
before insert or update of rsvp_status, rsvp_person_id, checked_in_at, last_confirmed_at on public.guests
for each row execute function public.set_guest_checkin_from_rsvp();

create or replace function public.set_invitation_checkin_from_submit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attending_count integer;
  v_declined_count integer;
begin
  if new.status = 'responded' and (old.status is distinct from new.status or old.submitted_at is distinct from new.submitted_at) then
    select
      count(*) filter (where attending is true),
      count(*) filter (where attending is false)
    into v_attending_count, v_declined_count
    from public.rsvp_people
    where invitation_id = new.id;

    new.last_confirmed_at := coalesce(new.last_confirmed_at, now());
    new.checked_in_at := coalesce(new.checked_in_at, new.last_confirmed_at, now());
    new.check_in_status := case
      when coalesce(v_attending_count, 0) > 0 then 'checked_in'
      when coalesce(v_declined_count, 0) > 0 then 'cant_make_it'
      else 'not_checked_in'
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists set_invitation_checkin_from_submit on public.rsvp_invitations;
create trigger set_invitation_checkin_from_submit
before update of status, submitted_at on public.rsvp_invitations
for each row execute function public.set_invitation_checkin_from_submit();
