-- Optional guest check-in fields.
-- This migration is additive and safe to run after the RSVP control-centre migration.

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

create index if not exists rsvp_invitations_checkin_idx
  on public.rsvp_invitations(celebration, check_in_status, checked_in_at)
  where revoked_at is null;

create index if not exists guests_checkin_idx
  on public.guests(celebration, check_in_status, checked_in_at)
  where rsvp_person_id is not null;
