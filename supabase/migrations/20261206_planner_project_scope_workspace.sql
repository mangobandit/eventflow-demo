begin;

-- The authenticated workspace RPCs enforce the account scope before returning or
-- changing project data. Client portal RPCs keep their separate link-token checks.
create function public.planner_workspace_assert_scope(p_allowed_scope text, p_requested_scope text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not coalesce(p_allowed_scope = 'all' or p_allowed_scope = p_requested_scope, false) then
    raise exception 'This project is unavailable.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.planner_workspace_assert_scope(text, text) from public, anon, authenticated, service_role;

create or replace function public.planner_workspace_load(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_scope text := public.planner_session_scope(p_token);
begin
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.updated_at desc)
    from public.planner_workspace_records r
    where allowed_scope = 'all' or r.scope = allowed_scope
  ), '[]'::jsonb);
end;
$$;

create or replace function public.planner_workspace_save(
  p_token text, p_scope text, p_kind text, p_id uuid, p_title text, p_data jsonb, p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.planner_users%rowtype;
  saved public.planner_workspace_records%rowtype;
begin
  actor := public.require_planner_session(p_token);
  perform public.planner_workspace_assert_scope(actor.planning_scope, p_scope);
  if not public.planner_workspace_scope_exists(p_scope)
    or (p_kind = 'project' and p_scope <> 'shared')
    or p_kind is null or p_kind not in (
      'project','note','message','slot','meeting','template','guide','vendor_score',
      'site','venue','reminder','project_task','project_timeline'
    )
    or p_title is null or length(btrim(p_title)) not between 1 and 160
    or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data) > 262144 then
    raise exception 'Check the project, record title and details.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('planner-scope:'||p_scope,0));
  if not public.planner_workspace_scope_exists(p_scope) then
    raise exception 'This project is no longer available.' using errcode='22023';
  end if;

  if p_id is null and p_expected_version = 0 then
    insert into public.planner_workspace_records(scope,kind,title,data,created_by)
    values (p_scope,p_kind,btrim(p_title),p_data,actor.display_name)
    on conflict do nothing
    returning * into saved;
  elsif p_id is not null and p_expected_version > 0 then
    update public.planner_workspace_records r
    set title=btrim(p_title), data=p_data, version=r.version+1, updated_at=now()
    where r.id=p_id and r.scope=p_scope and r.kind=p_kind and r.version=p_expected_version
    returning * into saved;
  end if;

  if saved.id is null then
    raise exception 'This record changed elsewhere. Refresh planning tools before saving.' using errcode='40001';
  end if;
  return to_jsonb(saved);
end;
$$;

create or replace function public.planner_workspace_delete(p_token text,p_id uuid,p_expected_version bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_scope text := public.planner_session_scope(p_token);
  row_kind text;
begin
  perform pg_advisory_xact_lock(hashtextextended('planner-scope:'||p_id::text,0));
  select r.kind into row_kind
  from public.planner_workspace_records r
  where r.id = p_id and r.version = p_expected_version
    and (allowed_scope = 'all' or r.scope = allowed_scope)
  for update;
  if row_kind='project' and (
    exists (select 1 from public.planner_workspace_records r where r.scope=p_id::text)
    or exists (select 1 from public.planner_workspace_links l where l.scope=p_id::text and l.revoked_at is null and l.expires_at>now())
  ) then
    raise exception 'Remove this project’s records and revoke active links before deleting it.' using errcode='22023';
  end if;

  delete from public.planner_workspace_records r
  where r.id = p_id and r.version = p_expected_version
    and (allowed_scope = 'all' or r.scope = allowed_scope);
  if not found then
    raise exception 'This record changed elsewhere. Refresh planning tools before deleting.' using errcode='40001';
  end if;
  return true;
end;
$$;

create or replace function public.planner_workspace_create_link(
  p_token text,p_scope text,p_sections text[],p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  raw_token text;
  saved public.planner_workspace_links%rowtype;
begin
  perform public.planner_workspace_assert_scope(public.planner_session_scope(p_token), p_scope);
  if not public.planner_workspace_scope_exists(p_scope)
    or coalesce(cardinality(p_sections),0) not between 1 and 5
    or exists (select 1 from unnest(p_sections) s(key) where s.key is null or s.key not in ('timeline','guides','site','slots','feedback'))
    or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '366 days' then
    raise exception 'Choose allowed sections and an expiry within one year.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('planner-scope:'||p_scope,0));
  if not public.planner_workspace_scope_exists(p_scope) then
    raise exception 'This project is no longer available.' using errcode='22023';
  end if;

  raw_token := encode(gen_random_bytes(32),'hex');
  insert into public.planner_workspace_links(scope,token_hash,sections,expires_at)
  values (p_scope,digest(raw_token,'sha256'),array(select distinct key from unnest(p_sections) s(key)),p_expires_at)
  returning * into saved;
  return (to_jsonb(saved)-'token_hash') || jsonb_build_object('token',raw_token);
end;
$$;

create or replace function public.planner_workspace_list_links(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_scope text := public.planner_session_scope(p_token);
begin
  return coalesce((
    select jsonb_agg(to_jsonb(l) - 'token_hash' order by l.created_at desc)
    from public.planner_workspace_links l
    where allowed_scope = 'all' or l.scope = allowed_scope
  ), '[]'::jsonb);
end;
$$;

create or replace function public.planner_workspace_revoke_link(p_token text,p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_scope text := public.planner_session_scope(p_token);
begin
  update public.planner_workspace_links l
  set revoked_at = coalesce(l.revoked_at, now())
  where l.id = p_id and (allowed_scope = 'all' or l.scope = allowed_scope);
  return found;
end;
$$;

create or replace function public.planner_workspace_apply_template(
  p_token text,
  p_template_id uuid,
  p_scope text,
  p_base_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity public.planner_users%rowtype;
  template public.planner_workspace_records%rowtype;
  line jsonb;
  item_title text;
  item_notes text;
  template_type text;
  entry_kind text;
  item_day date;
  item_time time;
  written integer;
  inserted integer := 0;
begin
  identity := public.require_planner_session(p_token);
  perform public.planner_workspace_assert_scope(identity.planning_scope, p_scope);
  perform pg_advisory_xact_lock(hashtextextended('planner-scope:' || p_scope, 0));
  if p_scope is null or (
      p_scope not in ('shared', 'spain', 'south_africa') and not exists (
        select 1 from public.planner_workspace_records p where p.id::text = p_scope and p.kind = 'project'
      )
    ) or p_base_date is null then
    raise exception 'Choose a project and a base date.' using errcode = '22023';
  end if;

  select r.* into template
  from public.planner_workspace_records r
  where r.id = p_template_id and r.kind = 'template' and r.scope in (p_scope, 'shared')
    and (identity.planning_scope = 'all' or r.scope = identity.planning_scope)
  for share;

  template_type := template.data ->> 'type';
  if template.id is null or template_type is null or template_type not in ('tasks', 'timeline')
    or jsonb_typeof(template.data -> 'entries') is distinct from 'array' then
    raise exception 'Choose a valid template for this project.' using errcode = '22023';
  end if;
  if jsonb_array_length(template.data -> 'entries') not between 1 and 100 then
    raise exception 'A template needs between one and 100 entries.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('planner-template:' || p_scope || ':' || template_type, 0));
  entry_kind := case when template_type = 'tasks' then 'project_task' else 'project_timeline' end;

  for line in select value from jsonb_array_elements(template.data -> 'entries') loop
    item_title := btrim(line ->> 'title');
    item_notes := nullif(btrim(line ->> 'notes'), '');
    if item_title is null or length(item_title) not between 1 and 160
      or length(coalesce(item_notes, '')) > 6000
      or coalesce(line ->> 'offset', '0') !~ '^-?[0-9]{1,4}$'
      or coalesce(line ->> 'time', '') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$'
    then
      raise exception 'Check each title, date offset and time in the template.' using errcode = '22023';
    end if;
    item_day := p_base_date + coalesce((line ->> 'offset')::integer, 0);
    item_time := nullif(line ->> 'time', '')::time;

    if p_scope in ('shared', 'spain', 'south_africa') then
      if template_type = 'tasks' then
        insert into public.tasks (title, description, owner, celebration, due_date)
        select item_title, item_notes, 'shared', p_scope, item_day
        where not exists (
          select 1 from public.tasks t
          where t.celebration = p_scope and lower(btrim(t.title)) = lower(item_title) and t.due_date = item_day
        );
      else
        insert into public.timeline_items (title, notes, owner, celebration, item_date, item_time, audience)
        select item_title, item_notes, 'shared', p_scope, item_day, item_time, 'private'
        where not exists (
          select 1 from public.timeline_items t
          where t.celebration = p_scope and lower(btrim(t.title)) = lower(item_title) and t.item_date = item_day
            and t.item_time is not distinct from item_time
        );
      end if;
    else
      insert into public.planner_workspace_records (scope, kind, title, data, created_by)
      select p_scope, entry_kind, item_title, jsonb_build_object(
        'date', item_day, 'time', case when item_time is null then null else left(item_time::text, 5) end, 'notes', item_notes
      ), identity.display_name
      where not exists (
        select 1 from public.planner_workspace_records t
        where t.scope = p_scope and t.kind = entry_kind and lower(btrim(t.title)) = lower(item_title)
          and t.data ->> 'date' = item_day::text
          and (entry_kind = 'project_task' or t.data ->> 'time' is not distinct from
            case when item_time is null then null else left(item_time::text, 5) end)
      );
    end if;

    get diagnostics written = row_count;
    inserted := inserted + written;
  end loop;

  return jsonb_build_object('count', inserted);
end;
$$;

create or replace function public.planner_workspace_conversation(
  p_token text,
  p_scope text,
  p_link_id uuid,
  p_before uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.planner_workspace_assert_scope(public.planner_session_scope(p_token), p_scope);
  return public.planner_workspace_feedback_page(
    public.planner_workspace_require_feedback_link(p_scope, p_link_id, true), p_before
  );
end;
$$;

create or replace function public.planner_workspace_reply(p_token text, p_scope text, p_link_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  planner public.planner_users%rowtype;
  planner_name text;
begin
  planner := public.require_planner_session(p_token);
  perform public.planner_workspace_assert_scope(planner.planning_scope, p_scope);
  planner_name := coalesce(nullif(btrim(regexp_replace(planner.display_name, '[[:cntrl:]]', ' ', 'g')), ''), 'Planner');
  return public.planner_workspace_feedback_insert(
    public.planner_workspace_require_feedback_link(p_scope, p_link_id, false),
    'planner', left(planner_name, 120), p_body
  );
end;
$$;

create or replace function public.planner_workspace_list_conversations(p_token text, p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.planner_workspace_assert_scope(public.planner_session_scope(p_token), p_scope);
  if not public.planner_workspace_scope_exists(p_scope) then
    raise exception 'This project is unavailable.' using errcode = '28000';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'link_id', l.id,
      'client_name', client.name,
      'last_message_at', latest.created_at,
      'last_role', latest.role,
      'revoked_at', l.revoked_at,
      'expires_at', l.expires_at
    ) order by coalesce(latest.created_at, l.created_at) desc, l.id)
    from public.planner_workspace_links l
    left join lateral (
      select m.role, m.created_at
      from public.planner_workspace_conversation_messages m
      where m.link_id = l.id
      order by m.created_at desc, m.id desc
      limit 1
    ) latest on true
    left join lateral (
      select m.name
      from public.planner_workspace_conversation_messages m
      where m.link_id = l.id and m.role = 'client'
      order by m.created_at desc, m.id desc
      limit 1
    ) client on true
    where l.scope = p_scope and 'feedback' = any(l.sections)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.planner_workspace_unanswered(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_scope text := public.planner_session_scope(p_token);
begin
  return coalesce((
    select jsonb_agg(to_jsonb(pending) order by pending.created_at desc, pending.link_id)
    from (
      select link.id as link_id, link.scope, latest.name, latest.created_at
      from public.planner_workspace_links link
      cross join lateral (
        select message.role, message.name, message.created_at
        from public.planner_workspace_conversation_messages message
        where message.link_id = link.id
        order by message.created_at desc, message.id desc
        limit 1
      ) latest
      where (allowed_scope = 'all' or link.scope = allowed_scope)
        and 'feedback' = any(link.sections)
        and link.revoked_at is null
        and link.expires_at > clock_timestamp()
        and public.planner_workspace_scope_exists(link.scope)
        and latest.role = 'client'
      order by latest.created_at desc, link.id
      limit 100
    ) pending
  ), '[]'::jsonb);
end;
$$;

commit;
