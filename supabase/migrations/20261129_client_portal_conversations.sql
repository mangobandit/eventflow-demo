-- One private conversation per feedback-enabled client link.
create table public.planner_workspace_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.planner_workspace_links(id) on delete cascade,
  role text not null check (role in ('client', 'planner')),
  name text not null check (char_length(name) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);

create index planner_workspace_conversation_messages_link_idx
  on public.planner_workspace_conversation_messages(link_id, created_at desc, id desc);

alter table public.planner_workspace_conversation_messages enable row level security;
revoke all on table public.planner_workspace_conversation_messages from public, anon, authenticated;

create function public.planner_workspace_client_feedback_link(p_link text)
returns uuid
language plpgsql
set search_path = pg_catalog, extensions, public
as $$
declare
  shared public.planner_workspace_links%rowtype;
begin
  if p_link is null or p_link !~ '^[0-9a-f]{64}$' then
    raise exception 'This conversation link is unavailable.' using errcode = '28000';
  end if;

  select l.* into shared
  from public.planner_workspace_links l
  where l.token_hash = digest(p_link, 'sha256'::text)
    and 'feedback' = any(l.sections)
    and l.revoked_at is null
    and l.expires_at > clock_timestamp()
  for share;

  if shared.id is null or not public.planner_workspace_scope_exists(shared.scope) then
    raise exception 'This conversation link is unavailable.' using errcode = '28000';
  end if;
  return shared.id;
end;
$$;

create function public.planner_workspace_require_feedback_link(
  p_scope text,
  p_link_id uuid,
  p_archived boolean
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  shared public.planner_workspace_links%rowtype;
begin
  select l.* into shared
  from public.planner_workspace_links l
  where l.id = p_link_id and l.scope = p_scope and 'feedback' = any(l.sections)
    and (p_archived or (l.revoked_at is null and l.expires_at > clock_timestamp()))
  for share;

  if shared.id is null or not public.planner_workspace_scope_exists(shared.scope) then
    raise exception 'This conversation link is unavailable.' using errcode = '28000';
  end if;
  return shared.id;
end;
$$;

create function public.planner_workspace_feedback_page(p_link_id uuid, p_before uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  before_at timestamptz;
begin
  if p_before is not null then
    select m.created_at into before_at
    from public.planner_workspace_conversation_messages m
    where m.link_id = p_link_id and m.id = p_before;

    if not found then
      raise exception 'That message page is unavailable. Reload the conversation.' using errcode = '22023';
    end if;
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(page) order by page.created_at, page.id)
    from (
      select m.id, m.role, m.name, m.body, m.created_at
      from public.planner_workspace_conversation_messages m
      where m.link_id = p_link_id
        and (p_before is null or (m.created_at, m.id) < (before_at, p_before))
      order by m.created_at desc, m.id desc
      limit 100
    ) page
  ), '[]'::jsonb);
end;
$$;

create function public.planner_workspace_feedback_insert(
  p_link_id uuid,
  p_role text,
  p_name text,
  p_body text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  clean_name text := regexp_replace(coalesce(p_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  clean_body text := regexp_replace(coalesce(p_body, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  saved public.planner_workspace_conversation_messages%rowtype;
begin
  if char_length(clean_name) not between 1 and 120 or clean_name ~ '[[:cntrl:]]' then
    raise exception 'Enter a name of up to 120 characters.' using errcode = '22023';
  end if;
  if char_length(clean_body) not between 1 and 2000 then
    raise exception 'Enter a message of up to 2,000 characters.' using errcode = '22023';
  end if;

  insert into public.planner_workspace_conversation_messages(link_id, role, name, body)
  values (p_link_id, p_role, clean_name, clean_body)
  returning * into saved;

  return jsonb_build_object(
    'id', saved.id, 'role', saved.role, 'name', saved.name,
    'body', saved.body, 'created_at', saved.created_at
  );
end;
$$;

create function public.planner_workspace_client_messages(p_link text, p_before uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.planner_workspace_feedback_page(public.planner_workspace_client_feedback_link(p_link), p_before);
end;
$$;

create function public.planner_workspace_client_send(p_link text, p_name text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.planner_workspace_feedback_insert(
    public.planner_workspace_client_feedback_link(p_link), 'client', p_name, p_body
  );
end;
$$;

create function public.planner_workspace_conversation(
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
  perform public.require_planner_session(p_token);
  return public.planner_workspace_feedback_page(
    public.planner_workspace_require_feedback_link(p_scope, p_link_id, true), p_before
  );
end;
$$;

create function public.planner_workspace_reply(p_token text, p_scope text, p_link_id uuid, p_body text)
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
  planner_name := coalesce(nullif(btrim(regexp_replace(planner.display_name, '[[:cntrl:]]', ' ', 'g')), ''), 'Planner');
  return public.planner_workspace_feedback_insert(
    public.planner_workspace_require_feedback_link(p_scope, p_link_id, false),
    'planner', left(planner_name, 120), p_body
  );
end;
$$;

create function public.planner_workspace_list_conversations(p_token text, p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_planner_session(p_token);
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

revoke all on function public.planner_workspace_client_feedback_link(text) from public, anon, authenticated;
revoke all on function public.planner_workspace_require_feedback_link(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.planner_workspace_feedback_page(uuid, uuid) from public, anon, authenticated;
revoke all on function public.planner_workspace_feedback_insert(uuid, text, text, text) from public, anon, authenticated;

revoke all on function public.planner_workspace_client_messages(text, uuid) from public, anon, authenticated;
revoke all on function public.planner_workspace_client_send(text, text, text) from public, anon, authenticated;
revoke all on function public.planner_workspace_conversation(text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.planner_workspace_reply(text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.planner_workspace_list_conversations(text, text) from public, anon, authenticated;

grant execute on function public.planner_workspace_client_messages(text, uuid) to anon, authenticated;
grant execute on function public.planner_workspace_client_send(text, text, text) to anon, authenticated;
grant execute on function public.planner_workspace_conversation(text, text, uuid, uuid) to anon, authenticated;
grant execute on function public.planner_workspace_reply(text, text, uuid, text) to anon, authenticated;
grant execute on function public.planner_workspace_list_conversations(text, text) to anon, authenticated;
