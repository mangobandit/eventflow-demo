create table public.planner_workbook_sheets (
  position smallint primary key check (position > 0),
  name text not null unique check (length(btrim(name)) between 1 and 80),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 524288
  )
);

alter table public.planner_workbook_sheets enable row level security;
revoke all on table public.planner_workbook_sheets from public, anon, authenticated;

create function public.planner_load_workbook(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_planner_session(p_session_token);
  return coalesce((
    select jsonb_agg(to_jsonb(sheet) order by sheet.position)
    from public.planner_workbook_sheets sheet
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.planner_load_workbook(text) from public, anon, authenticated;
grant execute on function public.planner_load_workbook(text) to anon, authenticated;
