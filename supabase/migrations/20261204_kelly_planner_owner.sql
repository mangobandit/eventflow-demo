begin;

alter table public.planner_users
  drop constraint planner_users_planner_person_check,
  add constraint planner_users_planner_person_check
    check (planner_person in ('shared', 'matt', 'cara', 'kelly'));

alter table public.tasks
  drop constraint tasks_owner_check,
  add constraint tasks_owner_check check (owner in ('shared', 'matt', 'cara', 'kelly'));

alter table public.budget_items
  drop constraint budget_items_owner_check,
  add constraint budget_items_owner_check check (owner in ('shared', 'matt', 'cara', 'kelly'));

alter table public.guests
  drop constraint guests_owner_check,
  add constraint guests_owner_check check (owner in ('shared', 'matt', 'cara', 'kelly'));

alter table public.vendors
  drop constraint vendors_owner_check,
  add constraint vendors_owner_check check (owner in ('shared', 'matt', 'cara', 'kelly'));

alter table public.timeline_items
  drop constraint timeline_items_owner_check,
  add constraint timeline_items_owner_check check (owner in ('shared', 'matt', 'cara', 'kelly'));

alter table public.content_blocks
  drop constraint content_blocks_owner_check,
  add constraint content_blocks_owner_check check (owner in ('shared', 'matt', 'cara', 'kelly'));

-- Give the existing account its own planner lens while preserving its credentials and sessions.
update public.planner_users
set planner_person = 'kelly'
where username = 'kelly' and planner_person = 'shared';

commit;
