-- Numbered chairs extend existing private seating plans without changing table assignments.
create or replace function public.validate_planner_seating_chairs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  position record;
  table_id text;
  capacity integer;
begin
  if not (new.plan ? 'seats') then
    if tg_op = 'UPDATE' then
      if old.plan ? 'seats' then
        raise exception 'Reload the planner before editing a plan with named chairs.' using errcode = '22023';
      end if;
    end if;
    return new;
  end if;

  if jsonb_typeof(new.plan -> 'seats') is distinct from 'object'
    or jsonb_typeof(new.plan -> 'assignments') is distinct from 'object'
    or jsonb_typeof(new.plan -> 'tables') is distinct from 'array' then
    raise exception 'A seating plan needs a valid chair map.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_object_keys(new.plan -> 'assignments') a(guest)
    where not (new.plan -> 'seats') ? a.guest
  ) then
    raise exception 'Every seated guest needs a chair.' using errcode = '22023';
  end if;

  for position in select key, value from jsonb_each(new.plan -> 'seats') loop
    table_id := new.plan -> 'assignments' ->> position.key;
    if table_id is null or jsonb_typeof(position.value) <> 'number'
      or (position.value #>> '{}') !~ '^[1-9][0-9]{0,2}$' then
      raise exception 'Each chair must belong to a seated guest and have a valid number.' using errcode = '22023';
    end if;

    select (t.spec ->> 'capacity')::integer into capacity
    from jsonb_array_elements(new.plan -> 'tables') t(spec)
    where t.spec ->> 'id' = table_id;

    if capacity is null or (position.value #>> '{}')::integer > capacity then
      raise exception 'A chair number is outside its table.' using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1 from jsonb_each(new.plan -> 'seats') s(key, value)
    group by (new.plan -> 'assignments' ->> s.key), s.value
    having count(*) > 1
  ) then
    raise exception 'Two guests cannot share a chair.' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_planner_seating_chairs() from public, anon, authenticated;

create trigger validate_planner_seating_chairs
before insert or update of plan on public.planner_seating_plans
for each row execute function public.validate_planner_seating_chairs();

create or replace function public.remove_guest_seating_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.celebration = new.celebration then
      return null;
    end if;
  end if;

  update public.planner_seating_plans
  set plan = jsonb_set(
        case when plan ? 'seats'
          then jsonb_set(plan, '{seats}', (plan -> 'seats') - old.id::text)
          else plan
        end,
        '{assignments}', (plan -> 'assignments') - old.id::text
      ),
      version = version + 1,
      updated_at = now()
  where event = old.celebration and (plan -> 'assignments') ? old.id::text;

  return null;
end;
$$;
