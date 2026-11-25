begin;

alter table public.planner_users
  add column planning_scope text not null default 'all'
  check (planning_scope in ('all', 'south_africa'));

update public.planner_users
set planning_scope = 'south_africa'
where username = 'kelly';

create function public.planner_session_scope(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  planner public.planner_users%rowtype;
begin
  planner := public.require_planner_session(p_token);
  return planner.planning_scope;
end;
$$;

revoke all on function public.planner_session_scope(text) from public, anon, authenticated, service_role;

create function public.planner_login_scoped_identity(p_result jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  planning_scope text := public.planner_session_scope(p_result ->> 'session_token');
begin
  return jsonb_set(p_result, '{identity,planning_scope}', to_jsonb(planning_scope));
end;
$$;

revoke all on function public.planner_login_scoped_identity(jsonb) from public, anon, authenticated, service_role;

alter function public.planner_login(text, text) rename to planner_login_unscoped;
revoke all on function public.planner_login_unscoped(text, text) from public, anon, authenticated, service_role;

create function public.planner_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.planner_login_scoped_identity(public.planner_login_unscoped(p_username, p_password));
end;
$$;

revoke all on function public.planner_login(text, text) from public;
grant execute on function public.planner_login(text, text) to anon, authenticated, service_role;

-- Some installations also expose the paid-licence login.
do $migration$
begin
  if to_regprocedure('public.planner_login(text,text,text,uuid)') is not null then
    alter function public.planner_login(text, text, text, uuid) rename to planner_login_unscoped;
    revoke all on function public.planner_login_unscoped(text, text, text, uuid) from public, anon, authenticated, service_role;

    execute $ddl$
      create function public.planner_login(
        p_username text, p_password text, p_activation_token text, p_installation_id uuid
      )
      returns jsonb
      language plpgsql
      security definer
      set search_path = ''
      as $login$
      begin
        return public.planner_login_scoped_identity(
          public.planner_login_unscoped(p_username, p_password, p_activation_token, p_installation_id)
        );
      end;
      $login$
    $ddl$;

    revoke all on function public.planner_login(text, text, text, uuid) from public;
    grant execute on function public.planner_login(text, text, text, uuid) to anon, authenticated, service_role;
  end if;
end;
$migration$;

create or replace function public.planner_get_session(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  planner public.planner_users%rowtype;
begin
  planner := public.require_planner_session(p_session_token);
  return jsonb_build_object('identity', jsonb_build_object(
    'username', planner.username,
    'planner_person', planner.planner_person,
    'display_name', planner.display_name,
    'planning_scope', planner.planning_scope
  ));
end;
$$;

create or replace function public.planner_load_all(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  planner public.planner_users%rowtype;
begin
  planner := public.require_planner_session(p_session_token);
  return jsonb_build_object(
    'identity', jsonb_build_object(
      'username', planner.username,
      'planner_person', planner.planner_person,
      'display_name', planner.display_name,
      'planning_scope', planner.planning_scope
    ),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.updated_at desc)
      from public.tasks t
      where planner.planning_scope = 'all' or t.celebration = planner.planning_scope
    ), '[]'::jsonb),
    'budget_items', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.updated_at desc)
      from public.budget_items b
      where planner.planning_scope = 'all' or b.celebration = planner.planning_scope
    ), '[]'::jsonb),
    'guests', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.updated_at desc)
      from public.guests g
      where planner.planning_scope = 'all' or g.celebration = planner.planning_scope
    ), '[]'::jsonb),
    'vendors', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.updated_at desc)
      from public.vendors v
      where planner.planning_scope = 'all' or v.celebration = planner.planning_scope
    ), '[]'::jsonb),
    'timeline_items', coalesce((
      select jsonb_agg(to_jsonb(ti) order by ti.item_date asc, ti.item_time asc nulls last)
      from public.timeline_items ti
      where planner.planning_scope = 'all' or ti.celebration = planner.planning_scope
    ), '[]'::jsonb),
    'content_blocks', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.sort_order asc, c.updated_at desc)
      from public.content_blocks c
      where planner.planning_scope = 'all' or c.country = planner.planning_scope
    ), '[]'::jsonb)
  );
end;
$$;

create function public.planner_entity_scope_field(p_table text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  case
    when p_table = 'content_blocks' then
      return 'country';
    when p_table in ('tasks', 'budget_items', 'guests', 'vendors', 'timeline_items') then
      return 'celebration';
    else
      raise exception 'Unsupported planner table' using errcode = '22023';
  end case;
end;
$$;

create function public.planner_lock_scoped_entity(p_table text, p_record_id uuid, p_scope text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  scope_field text := public.planner_entity_scope_field(p_table);
  allowed boolean;
begin
  execute format('select true from public.%I where id = $1 and %I = $2 for update', p_table, scope_field)
    into allowed using p_record_id, p_scope;
  if allowed is not true then
    raise exception 'This record is outside your planner access.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.planner_entity_scope_field(text) from public, anon, authenticated, service_role;
revoke all on function public.planner_lock_scoped_entity(text, uuid, text) from public, anon, authenticated, service_role;

alter function public.planner_save_entity(text, text, uuid, jsonb) rename to planner_save_entity_unscoped;
alter function public.planner_delete_entity(text, text, uuid) rename to planner_delete_entity_unscoped;
alter function public.planner_set_task_status(text, uuid, text, text) rename to planner_set_task_status_unscoped;
alter function public.planner_save_seating(text, text, jsonb, bigint) rename to planner_save_seating_unscoped;
alter function public.planner_set_guest_meal(text, uuid, text, integer) rename to planner_set_guest_meal_unscoped;

revoke all on function public.planner_save_entity_unscoped(text, text, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.planner_delete_entity_unscoped(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.planner_set_task_status_unscoped(text, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.planner_save_seating_unscoped(text, text, jsonb, bigint) from public, anon, authenticated, service_role;
revoke all on function public.planner_set_guest_meal_unscoped(text, uuid, text, integer) from public, anon, authenticated, service_role;

create function public.planner_save_entity(p_session_token text, p_table text, p_record_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  planning_scope text := public.planner_session_scope(p_session_token);
  table_name text := lower(btrim(coalesce(p_table, '')));
  scope_field text;
begin
  if planning_scope <> 'all' then
    scope_field := public.planner_entity_scope_field(table_name);
    if btrim(p_payload ->> scope_field) is distinct from planning_scope then
      raise exception 'Choose South Africa for this record.' using errcode = '42501';
    end if;
    if p_record_id is not null then
      perform public.planner_lock_scoped_entity(table_name, p_record_id, planning_scope);
    end if;
  end if;
  return public.planner_save_entity_unscoped(p_session_token, p_table, p_record_id, p_payload);
end;
$$;

create function public.planner_delete_entity(p_session_token text, p_table text, p_record_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  planning_scope text := public.planner_session_scope(p_session_token);
  table_name text := lower(btrim(coalesce(p_table, '')));
begin
  if planning_scope <> 'all' then
    perform public.planner_lock_scoped_entity(table_name, p_record_id, planning_scope);
  end if;
  return public.planner_delete_entity_unscoped(p_session_token, p_table, p_record_id);
end;
$$;

create or replace function public.planner_save_guest(p_session_token text, p_record_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved jsonb;
  child_flag jsonb := p_payload -> 'is_child';
begin
  -- Route through the scoped save before applying the child flag.
  saved := public.planner_save_entity(p_session_token, 'guests', p_record_id, p_payload);

  if child_flag is null then
    return saved;
  end if;
  if jsonb_typeof(child_flag) is distinct from 'boolean' then
    raise exception 'Child status must be true or false' using errcode = '22023';
  end if;

  if saved -> 'is_child' is distinct from child_flag then
    update public.guests g
    set is_child = (child_flag #>> '{}')::boolean
    where g.id = (saved ->> 'id')::uuid
    returning to_jsonb(g) into saved;
  end if;

  return saved;
end;
$$;

create function public.planner_set_task_status(p_token text, p_task_id uuid, p_status text, p_expected_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  planning_scope text := public.planner_session_scope(p_token);
begin
  if planning_scope <> 'all' then
    perform public.planner_lock_scoped_entity('tasks', p_task_id, planning_scope);
  end if;
  return public.planner_set_task_status_unscoped(p_token, p_task_id, p_status, p_expected_status);
end;
$$;

create or replace function public.planner_load_seating(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  planning_scope text := public.planner_session_scope(p_token);
begin
  return coalesce((
    select jsonb_object_agg(s.event, jsonb_build_object('plan', s.plan, 'version', s.version))
    from public.planner_seating_plans s
    where planning_scope = 'all' or s.event = planning_scope
  ), '{}'::jsonb);
end;
$$;

create function public.planner_save_seating(p_token text, p_event text, p_plan jsonb, p_expected_version bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  planning_scope text := public.planner_session_scope(p_token);
begin
  if planning_scope <> 'all' and p_event is distinct from planning_scope then
    raise exception 'This celebration is outside your planner access.' using errcode = '42501';
  end if;
  return public.planner_save_seating_unscoped(p_token, p_event, p_plan, p_expected_version);
end;
$$;

create or replace function public.planner_load_guest_meals(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  planning_scope text := public.planner_session_scope(p_token);
begin
  return coalesce((
    select jsonb_agg(to_jsonb(meal))
    from public.planner_guest_meals meal
    join public.guests g on g.id = meal.guest_id
    where planning_scope = 'all' or g.celebration = planning_scope
  ), '[]'::jsonb);
end;
$$;

create function public.planner_set_guest_meal(p_token text, p_guest_id uuid, p_choice text, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  planning_scope text := public.planner_session_scope(p_token);
begin
  if planning_scope <> 'all' then
    perform public.planner_lock_scoped_entity('guests', p_guest_id, planning_scope);
  end if;
  return public.planner_set_guest_meal_unscoped(p_token, p_guest_id, p_choice, p_expected_version);
end;
$$;

revoke all on function public.planner_save_entity(text, text, uuid, jsonb) from public;
revoke all on function public.planner_delete_entity(text, text, uuid) from public;
revoke all on function public.planner_set_task_status(text, uuid, text, text) from public;
revoke all on function public.planner_save_seating(text, text, jsonb, bigint) from public;
revoke all on function public.planner_set_guest_meal(text, uuid, text, integer) from public;

grant execute on function public.planner_save_entity(text, text, uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.planner_delete_entity(text, text, uuid) to anon, authenticated, service_role;
grant execute on function public.planner_set_task_status(text, uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.planner_save_seating(text, text, jsonb, bigint) to anon, authenticated, service_role;
grant execute on function public.planner_set_guest_meal(text, uuid, text, integer) to anon, authenticated, service_role;

commit;
