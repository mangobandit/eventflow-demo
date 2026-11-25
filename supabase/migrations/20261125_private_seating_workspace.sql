-- Private seating for the couple planner.
create table if not exists public.planner_seating_plans (
  event text primary key check (event in ('spain', 'south_africa')),
  plan jsonb not null,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

alter table public.planner_seating_plans enable row level security;
revoke all on table public.planner_seating_plans from public, anon, authenticated;

create or replace function public.planner_load_seating(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_planner_session(p_token);

  return coalesce((
    select jsonb_object_agg(s.event, jsonb_build_object('plan', s.plan, 'version', s.version))
    from public.planner_seating_plans s
  ), '{}'::jsonb);
end;
$$;

create or replace function public.planner_save_seating(
  p_token text,
  p_event text,
  p_plan jsonb,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  table_spec jsonb;
  table_id text;
  table_ids text[] := '{}';
  saved public.planner_seating_plans%rowtype;
begin
  perform public.require_planner_session(p_token);

  if p_event is null or p_event not in ('spain', 'south_africa')
    or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Choose a valid celebration and plan version.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_plan) is distinct from 'object'
    or jsonb_typeof(p_plan -> 'tables') is distinct from 'array'
    or jsonb_typeof(p_plan -> 'assignments') is distinct from 'object' then
    raise exception 'The seating plan must contain tables and assignments.' using errcode = '22023';
  end if;

  if pg_column_size(p_plan) > 524288 or jsonb_array_length(p_plan -> 'tables') > 160 then
    raise exception 'This seating plan is too large.' using errcode = '22023';
  end if;

  for table_spec in select value from jsonb_array_elements(p_plan -> 'tables') loop
    table_id := table_spec ->> 'id';
    if jsonb_typeof(table_spec -> 'id') is distinct from 'string'
      or coalesce(table_id, '') !~ '^[A-Za-z0-9_-]{1,80}$' or table_id = any(table_ids)
      or jsonb_typeof(table_spec -> 'name') is distinct from 'string'
      or char_length(btrim(table_spec ->> 'name')) not between 1 and 140
      or coalesce(table_spec ->> 'shape', '') not in ('round', 'rectangle', 'square')
      or jsonb_typeof(table_spec -> 'capacity') is distinct from 'number'
      or jsonb_typeof(table_spec -> 'x') is distinct from 'number'
      or jsonb_typeof(table_spec -> 'y') is distinct from 'number'
      or jsonb_typeof(table_spec -> 'rotation') is distinct from 'number' then
      raise exception 'A table is missing its name, shape, capacity or position.' using errcode = '22023';
    end if;
    if (table_spec ->> 'capacity') !~ '^[0-9]+$'
      or (table_spec ->> 'capacity')::numeric not between 1 and 200
      or (table_spec ->> 'x')::numeric not between 0 and 100
      or (table_spec ->> 'y')::numeric not between 0 and 100
      or (table_spec ->> 'rotation')::numeric not between 0 and 360 then
      raise exception 'A table is outside the allowed size or room coordinates.' using errcode = '22023';
    end if;
    table_ids := array_append(table_ids, table_id);
  end loop;

  perform g.id
  from public.guests g
  join jsonb_object_keys(p_plan -> 'assignments') a(guest_id) on a.guest_id = g.id::text
  where g.celebration = p_event
  order by g.id
  for share of g;

  if exists (
    select 1
    from jsonb_each(p_plan -> 'assignments') a(key, value)
    where jsonb_typeof(value) <> 'string' or not ((value #>> '{}') = any(table_ids))
      or not exists (
        select 1 from public.guests g
        where g.id::text = a.key and g.celebration = p_event
      )
  ) then
    raise exception 'An assignment refers to a missing table or guest.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_plan -> 'tables') t(spec)
    join (
      select value as table_id, count(*) as occupants
      from jsonb_each_text(p_plan -> 'assignments')
      group by value
    ) counts on counts.table_id = spec ->> 'id'
    where counts.occupants > (spec ->> 'capacity')::numeric
  ) then
    raise exception 'A table has more guests than available seats.' using errcode = '22023';
  end if;

  if p_expected_version = 0 then
    insert into public.planner_seating_plans(event, plan)
    values (p_event, p_plan)
    on conflict (event) do nothing
    returning * into saved;
  else
    update public.planner_seating_plans
    set plan = p_plan, version = version + 1, updated_at = now()
    where event = p_event and version = p_expected_version
    returning * into saved;
  end if;

  if saved.event is null then
    raise exception 'This seating plan changed elsewhere. Reload to see the latest version.' using errcode = '40001';
  end if;
  return jsonb_build_object('plan', saved.plan, 'version', saved.version);
end;
$$;

create or replace function public.remove_guest_seating_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.celebration = new.celebration then
    return null;
  end if;

  update public.planner_seating_plans
  set plan = jsonb_set(plan, '{assignments}', (plan -> 'assignments') - old.id::text),
      version = version + 1,
      updated_at = now()
  where event = old.celebration and (plan -> 'assignments') ? old.id::text;

  return null;
end;
$$;

revoke all on function public.remove_guest_seating_assignment() from public, anon, authenticated;
drop trigger if exists remove_guest_seating_assignment on public.guests;
create trigger remove_guest_seating_assignment
after delete or update of celebration on public.guests
for each row execute function public.remove_guest_seating_assignment();

create or replace function public.planner_set_task_status(
  p_token text,
  p_task_id uuid,
  p_status text,
  p_expected_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.tasks%rowtype;
begin
  perform public.require_planner_session(p_token);

  if p_status is null or p_status not in ('outstanding', 'pending', 'approved') then
    raise exception 'Choose a valid action status.' using errcode = '22023';
  end if;

  update public.tasks
  set status = p_status
  where id = p_task_id and status = p_expected_status
  returning * into saved;

  if saved.id is null then
    raise exception 'This action changed elsewhere. The board will refresh.' using errcode = '40001';
  end if;
  return to_jsonb(saved);
end;
$$;

revoke all on function public.planner_load_seating(text) from public, anon, authenticated;
revoke all on function public.planner_save_seating(text, text, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.planner_set_task_status(text, uuid, text, text) from public, anon, authenticated;

grant execute on function public.planner_load_seating(text) to anon, authenticated;
grant execute on function public.planner_save_seating(text, text, jsonb, bigint) to anon, authenticated;
grant execute on function public.planner_set_task_status(text, uuid, text, text) to anon, authenticated;
