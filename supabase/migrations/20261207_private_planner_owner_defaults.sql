begin;

create table public.planner_owner_defaults (
  kind text primary key check (kind in ('checklist', 'honeymoon')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 524288)
);

alter table public.planner_owner_defaults enable row level security;
revoke all on table public.planner_owner_defaults from public, anon, authenticated;

create function public.planner_load_owner_defaults(p_session_token text, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.planner_session_scope(p_session_token) is distinct from 'all' then
    raise exception 'Full planner access is required.' using errcode = '42501';
  end if;

  return (
    select defaults.payload from public.planner_owner_defaults defaults where defaults.kind = p_kind
  );
end;
$$;

revoke all on function public.planner_load_owner_defaults(text, text) from public, anon, authenticated;
grant execute on function public.planner_load_owner_defaults(text, text) to anon, authenticated;

commit;
