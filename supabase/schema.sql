-- Matt & Cara Wedding House
-- Run this entire file in a new Supabase project's SQL editor.
-- Private tables are protected by Row Level Security. Only emails in
-- public.allowed_users can read or change planner data.

create extension if not exists pgcrypto;

create table if not exists public.allowed_users (
  email text primary key check (email = lower(email)),
  planner_person text not null check (planner_person in ('matt', 'cara', 'shared')),
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.allowed_users enable row level security;

create or replace function public.is_wedding_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.allowed_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.current_planner_person()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select planner_person
  from public.allowed_users
  where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

grant execute on function public.is_wedding_owner() to authenticated;
grant execute on function public.current_planner_person() to authenticated;

drop policy if exists "Approved users can read their identity" on public.allowed_users;
create policy "Approved users can read their identity"
on public.allowed_users for select
to authenticated
using (email = lower(coalesce(auth.jwt() ->> 'email', '')) and public.is_wedding_owner());

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  owner text not null default 'shared' check (owner in ('shared', 'matt', 'cara')),
  celebration text not null default 'shared' check (celebration in ('shared', 'spain', 'south_africa')),
  category text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'outstanding' check (status in ('outstanding', 'pending', 'approved')),
  due_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner text not null default 'shared' check (owner in ('shared', 'matt', 'cara')),
  celebration text not null default 'shared' check (celebration in ('shared', 'spain', 'south_africa')),
  category text,
  currency text not null default 'EUR' check (currency in ('EUR', 'ZAR')),
  estimated numeric(14,2) not null default 0 check (estimated >= 0),
  deposit numeric(14,2) not null default 0 check (deposit >= 0),
  paid numeric(14,2) not null default 0 check (paid >= 0),
  due_date date,
  status text not null default 'outstanding' check (status in ('outstanding', 'pending', 'approved')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  party_name text,
  owner text not null default 'shared' check (owner in ('shared', 'matt', 'cara')),
  celebration text not null check (celebration in ('spain', 'south_africa')),
  rsvp_status text not null default 'no_response' check (rsvp_status in ('yes', 'no', 'tbc', 'no_response')),
  dietary text,
  transport text,
  accommodation text,
  contact text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner text not null default 'shared' check (owner in ('shared', 'matt', 'cara')),
  celebration text not null default 'shared' check (celebration in ('shared', 'spain', 'south_africa')),
  category text,
  contact_name text,
  email text,
  phone text,
  currency text not null default 'EUR' check (currency in ('EUR', 'ZAR')),
  quote_amount numeric(14,2) check (quote_amount is null or quote_amount >= 0),
  next_action text,
  due_date date,
  status text not null default 'outstanding' check (status in ('outstanding', 'pending', 'approved')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timeline_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner text not null default 'shared' check (owner in ('shared', 'matt', 'cara')),
  celebration text not null default 'shared' check (celebration in ('shared', 'spain', 'south_africa')),
  item_date date not null,
  item_time time,
  audience text not null default 'private' check (audience in ('private', 'guest')),
  location text,
  sort_order integer not null default 0,
  status text not null default 'outstanding' check (status in ('outstanding', 'pending', 'approved')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  section text not null default 'general' check (section in ('announcement', 'faq', 'travel', 'stay', 'general')),
  country text not null default 'both' check (country in ('both', 'spain', 'south_africa')),
  title text not null,
  body text not null,
  owner text not null default 'shared' check (owner in ('shared', 'matt', 'cara')),
  sort_order integer not null default 0,
  published boolean not null default false,
  publish_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_owner_status_due_idx on public.tasks(owner, status, due_date);
create index if not exists budget_owner_due_idx on public.budget_items(owner, due_date);
create index if not exists guests_celebration_rsvp_idx on public.guests(celebration, rsvp_status);
create index if not exists vendors_owner_status_idx on public.vendors(owner, status);
create index if not exists timeline_date_idx on public.timeline_items(item_date, item_time);
create index if not exists content_public_idx on public.content_blocks(published, publish_at, sort_order);

-- Keep updated_at trustworthy.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['tasks','budget_items','guests','vendors','timeline_items','content_blocks']
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

-- Enable RLS on every data table.
alter table public.tasks enable row level security;
alter table public.budget_items enable row level security;
alter table public.guests enable row level security;
alter table public.vendors enable row level security;
alter table public.timeline_items enable row level security;
alter table public.content_blocks enable row level security;

-- A compact helper creates the same owner-only policies on private tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['tasks','budget_items','guests','vendors','timeline_items']
  loop
    execute format('drop policy if exists "Owners can select %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Owners can insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Owners can update %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Owners can delete %1$s" on public.%1$I', table_name);
    execute format('create policy "Owners can select %1$s" on public.%1$I for select to authenticated using (public.is_wedding_owner())', table_name);
    execute format('create policy "Owners can insert %1$s" on public.%1$I for insert to authenticated with check (public.is_wedding_owner())', table_name);
    execute format('create policy "Owners can update %1$s" on public.%1$I for update to authenticated using (public.is_wedding_owner()) with check (public.is_wedding_owner())', table_name);
    execute format('create policy "Owners can delete %1$s" on public.%1$I for delete to authenticated using (public.is_wedding_owner())', table_name);
  end loop;
end $$;

-- content_blocks is editable only by Matt/Cara, but published rows may be read by guests.
drop policy if exists "Owners can select content" on public.content_blocks;
drop policy if exists "Owners can insert content" on public.content_blocks;
drop policy if exists "Owners can update content" on public.content_blocks;
drop policy if exists "Owners can delete content" on public.content_blocks;
drop policy if exists "Guests can read published content" on public.content_blocks;

create policy "Owners can select content"
on public.content_blocks for select to authenticated
using (public.is_wedding_owner());
create policy "Owners can insert content"
on public.content_blocks for insert to authenticated
with check (public.is_wedding_owner());
create policy "Owners can update content"
on public.content_blocks for update to authenticated
using (public.is_wedding_owner()) with check (public.is_wedding_owner());
create policy "Owners can delete content"
on public.content_blocks for delete to authenticated
using (public.is_wedding_owner());
create policy "Guests can read published content"
on public.content_blocks for select to anon
using (published = true and (publish_at is null or publish_at <= now()));

revoke all on public.allowed_users from anon;
revoke all on public.tasks from anon;
revoke all on public.budget_items from anon;
revoke all on public.guests from anon;
revoke all on public.vendors from anon;
revoke all on public.timeline_items from anon;

grant select on public.allowed_users to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.budget_items to authenticated;
grant select, insert, update, delete on public.guests to authenticated;
grant select, insert, update, delete on public.vendors to authenticated;
grant select, insert, update, delete on public.timeline_items to authenticated;
grant select, insert, update, delete on public.content_blocks to authenticated;
grant select on public.content_blocks to anon;

-- Add the two real approved emails after replacing the placeholders.
-- Never commit real private email addresses to a public repository.
-- insert into public.allowed_users (email, planner_person, display_name) values
--   ('matt@example.com', 'matt', 'Matt'),
--   ('cara@example.com', 'cara', 'Cara');
