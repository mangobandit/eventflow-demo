alter table public.guests
  add column is_child boolean not null default false;

create function public.planner_save_guest(p_session_token text, p_record_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved jsonb;
  child_flag jsonb := p_payload -> 'is_child';
begin
  -- The existing guest save verifies the planner session and applies RSVP and check-in rules.
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

revoke all on function public.planner_save_guest(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.planner_save_guest(text, uuid, jsonb) to anon, authenticated;
