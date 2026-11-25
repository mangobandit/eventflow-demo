begin;

create table public.planner_workbook_source (
  source_key text primary key check (source_key = 'south_africa'),
  file_name text not null check (length(file_name) between 6 and 160 and right(lower(file_name), 5) = '.xlsx'),
  file_bytes bytea not null check (octet_length(file_bytes) between 1 and 1000000)
);

alter table public.planner_workbook_source enable row level security;
revoke all on table public.planner_workbook_source from public, anon, authenticated;

create function public.planner_load_workbook_source(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.planner_session_scope(p_session_token) not in ('all', 'south_africa') then
    raise exception 'This workbook is outside your planner access.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'name', source.file_name,
      'content', replace(encode(source.file_bytes, 'base64'), E'\n', '')
    )
    from public.planner_workbook_source source
    where source.source_key = 'south_africa'
  );
end;
$$;

revoke all on function public.planner_load_workbook_source(text) from public, anon, authenticated;
grant execute on function public.planner_load_workbook_source(text) to anon, authenticated;

commit;
