create function public.planner_workspace_unanswered(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_planner_session(p_token);
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
      where 'feedback' = any(link.sections)
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

revoke all on function public.planner_workspace_unanswered(text) from public, anon, authenticated;
grant execute on function public.planner_workspace_unanswered(text) to anon, authenticated;
