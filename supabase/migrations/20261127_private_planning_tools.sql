-- Scoped planning records and expiring, revocable client links.
create table if not exists public.planner_workspace_records (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  kind text not null check (kind in (
    'project', 'note', 'message', 'slot', 'meeting', 'template', 'guide', 'vendor_score',
    'site', 'venue', 'reminder', 'project_task', 'project_timeline'
  )),
  title text not null check (length(btrim(title)) between 1 and 160),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 262144),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null
);

create table if not exists public.planner_workspace_links (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  token_hash bytea not null unique,
  sections text[] not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists planner_workspace_scope_kind_idx on public.planner_workspace_records(scope, kind, updated_at desc);
create unique index if not exists planner_workspace_single_document_idx
  on public.planner_workspace_records(scope,kind) where kind in ('site','venue');
create index if not exists planner_workspace_links_scope_idx on public.planner_workspace_links(scope, created_at desc);

alter table public.planner_workspace_records enable row level security;
alter table public.planner_workspace_links enable row level security;
revoke all on table public.planner_workspace_records, public.planner_workspace_links from public, anon, authenticated;

create or replace function public.planner_workspace_scope_exists(p_scope text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_scope in ('shared', 'spain', 'south_africa'), false) or exists (
    select 1 from public.planner_workspace_records r where r.id::text = p_scope and r.kind='project'
  );
$$;
revoke all on function public.planner_workspace_scope_exists(text) from public, anon, authenticated;

create or replace function public.planner_workspace_load(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_planner_session(p_token);
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.updated_at desc) from public.planner_workspace_records r), '[]'::jsonb);
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
  row_kind text;
begin
  perform public.require_planner_session(p_token);
  perform pg_advisory_xact_lock(hashtextextended('planner-scope:'||p_id::text,0));
  select kind into row_kind from public.planner_workspace_records r where r.id=p_id and r.version=p_expected_version;
  if row_kind='project' and (
    exists (select 1 from public.planner_workspace_records r where r.scope=p_id::text)
    or exists (select 1 from public.planner_workspace_links l where l.scope=p_id::text and l.revoked_at is null and l.expires_at>now())
  ) then
    raise exception 'Remove this project’s records and revoke active links before deleting it.' using errcode='22023';
  end if;

  delete from public.planner_workspace_records r where r.id=p_id and r.version=p_expected_version;
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
  perform public.require_planner_session(p_token);
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
begin
  perform public.require_planner_session(p_token);
  return coalesce((select jsonb_agg(to_jsonb(l)-'token_hash' order by l.created_at desc) from public.planner_workspace_links l), '[]'::jsonb);
end;
$$;

create or replace function public.planner_workspace_revoke_link(p_token text,p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_planner_session(p_token);
  update public.planner_workspace_links l set revoked_at=coalesce(l.revoked_at,now()) where l.id=p_id;
  return found;
end;
$$;

create or replace function public.planner_workspace_open_link(p_link text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  found_link public.planner_workspace_links%rowtype;
  result jsonb;
  payload jsonb;
begin
  if p_link is null or p_link !~ '^[0-9a-f]{64}$' then
    raise exception 'This link is unavailable.' using errcode='28000';
  end if;
  select l.* into found_link from public.planner_workspace_links l
  where l.token_hash=digest(p_link,'sha256') and l.revoked_at is null and l.expires_at>now();
  if found_link.id is null or not public.planner_workspace_scope_exists(found_link.scope) then
    raise exception 'This link is unavailable.' using errcode='28000';
  end if;

  result := jsonb_build_object('scope',found_link.scope,'sections',found_link.sections,'title',
    case found_link.scope when 'south_africa' then 'South Africa' when 'spain' then 'Spain' when 'shared' then 'Wedding planning'
      else (select r.title from public.planner_workspace_records r where r.id::text=found_link.scope and r.kind='project') end);

  if 'timeline'=any(found_link.sections) then
    select coalesce(jsonb_agg(jsonb_build_object('title',t.title,'date',t.item_day,'time',t.item_at,'location',t.location)
      order by t.item_day,t.item_at),'[]'::jsonb) into payload from (
      select i.title,i.item_date::text as item_day,left(i.item_time::text,5) as item_at,i.location
      from public.timeline_items i where i.celebration=found_link.scope and i.audience='guest'
      union all
      select r.title,r.data->>'date',r.data->>'time',r.data->>'location'
      from public.planner_workspace_records r where r.scope=found_link.scope and r.kind='project_timeline' and r.data->'client_visible'='true'::jsonb
    ) t;
    result := result || jsonb_build_object('timeline',payload);
  end if;
  if 'guides'=any(found_link.sections) then
    select coalesce(jsonb_agg(jsonb_build_object('title',r.title,'body',r.data->>'body') order by r.updated_at desc),'[]'::jsonb)
    into payload from public.planner_workspace_records r
    where r.scope=found_link.scope and r.kind='guide' and r.data->'client_visible'='true'::jsonb;
    result := result || jsonb_build_object('guides',payload);
  end if;
  if 'site'=any(found_link.sections) then
    select jsonb_build_object('headline',r.data->>'headline','intro',r.data->>'intro','venue',r.data->>'venue','details',r.data->>'details')
    into payload from public.planner_workspace_records r
    where r.scope=found_link.scope and r.kind='site' and r.data->'client_visible'='true'::jsonb
    order by r.updated_at desc limit 1;
    result := result || jsonb_build_object('site',payload);
  end if;
  if 'slots'=any(found_link.sections) then
    select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'date',r.data->>'date','time',r.data->>'time','endTime',r.data->>'endTime')
      order by r.data->>'date',r.data->>'time'),'[]'::jsonb) into payload from public.planner_workspace_records r
    where r.scope=found_link.scope and r.kind='slot' and (r.data->'booked') is distinct from 'true'::jsonb
      and r.data->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and r.data->>'date'>=current_date::text;
    result := result || jsonb_build_object('slots',payload);
  end if;
  return result;
end;
$$;

revoke all on function public.planner_workspace_load(text) from public, anon, authenticated;
revoke all on function public.planner_workspace_save(text,text,text,uuid,text,jsonb,bigint) from public, anon, authenticated;
revoke all on function public.planner_workspace_delete(text,uuid,bigint) from public, anon, authenticated;
revoke all on function public.planner_workspace_create_link(text,text,text[],timestamptz) from public, anon, authenticated;
revoke all on function public.planner_workspace_list_links(text) from public, anon, authenticated;
revoke all on function public.planner_workspace_revoke_link(text,uuid) from public, anon, authenticated;
revoke all on function public.planner_workspace_open_link(text) from public, anon, authenticated;

grant execute on function public.planner_workspace_load(text) to anon, authenticated;
grant execute on function public.planner_workspace_save(text,text,text,uuid,text,jsonb,bigint) to anon, authenticated;
grant execute on function public.planner_workspace_delete(text,uuid,bigint) to anon, authenticated;
grant execute on function public.planner_workspace_create_link(text,text,text[],timestamptz) to anon, authenticated;
grant execute on function public.planner_workspace_list_links(text) to anon, authenticated;
grant execute on function public.planner_workspace_revoke_link(text,uuid) to anon, authenticated;
grant execute on function public.planner_workspace_open_link(text) to anon, authenticated;
