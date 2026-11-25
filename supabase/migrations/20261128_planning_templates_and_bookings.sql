-- Apply reusable plans atomically and let a client book one eligible meeting.
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
  where r.id = p_template_id and r.kind = 'template' and r.scope in (p_scope, 'shared');

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

revoke all on function public.planner_workspace_apply_template(text, uuid, text, date) from public, anon, authenticated;
grant execute on function public.planner_workspace_apply_template(text, uuid, text, date) to anon, authenticated;

create or replace function public.planner_workspace_book_slot(p_link text, p_slot_id uuid, p_name text, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  access jsonb;
  project_scope text;
  lead_name text := nullif(btrim(p_name), '');
  booking_notes text := nullif(btrim(p_notes), '');
  booked_slot uuid;
begin
  access := public.planner_workspace_open_link(p_link);
  project_scope := access ->> 'scope';
  if project_scope is null or not coalesce((access -> 'sections') ? 'slots', false) then
    raise exception 'This link cannot book meetings.' using errcode = '28000';
  end if;
  if lead_name is null or length(lead_name) > 120 or length(coalesce(booking_notes, '')) > 600 then
    raise exception 'Enter your name and up to 600 characters of notes.' using errcode = '22023';
  end if;

  update public.planner_workspace_records r
  set data = r.data || jsonb_build_object(
        'booked', true, 'bookedBy', lead_name, 'bookingNotes', booking_notes, 'bookedAt', now()
      ),
      version = r.version + 1,
      updated_at = now()
  where r.id = p_slot_id and r.scope = project_scope and r.kind = 'slot'
    and coalesce((r.data -> 'booked') = 'true'::jsonb, false) = false
    and r.data ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and r.data ->> 'date' >= current_date::text
  returning r.id into booked_slot;

  if booked_slot is null then
    raise exception 'This meeting is no longer available. Refresh to see other times.' using errcode = '40001';
  end if;

  return jsonb_build_object('booked', true);
end;
$$;

revoke all on function public.planner_workspace_book_slot(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.planner_workspace_book_slot(text, uuid, text, text) to anon, authenticated;
