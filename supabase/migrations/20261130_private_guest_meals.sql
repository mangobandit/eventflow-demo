create table public.planner_guest_meals (
  guest_id uuid primary key references public.guests(id) on delete cascade,
  choice text check (choice is null or char_length(choice) between 1 and 120),
  version integer not null check (version > 0)
);

alter table public.planner_guest_meals enable row level security;
revoke all on public.planner_guest_meals from public, anon, authenticated;

create function public.planner_load_guest_meals(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.require_planner_session(p_token);
  return coalesce((select jsonb_agg(to_jsonb(meal)) from public.planner_guest_meals meal), '[]'::jsonb);
end;
$$;

create function public.planner_set_guest_meal(
  p_token text, p_guest_id uuid, p_choice text, p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_choice text := nullif(btrim(p_choice), '');
  v_version integer;
  v_saved public.planner_guest_meals;
begin
  perform public.require_planner_session(p_token);
  if char_length(v_choice) > 120 then
    raise exception 'Enter a meal choice of up to 120 characters.';
  end if;

  -- The guest row serializes even the first save and prevents a concurrent delete.
  perform 1 from public.guests where id = p_guest_id for update;
  if not found then
    raise exception 'This guest no longer exists.';
  end if;

  select version into v_version from public.planner_guest_meals where guest_id = p_guest_id;
  if coalesce(v_version, 0) is distinct from p_expected_version then
    raise exception 'This meal choice changed elsewhere. Reload the roster and try again.';
  end if;

  insert into public.planner_guest_meals as meal (guest_id, choice, version)
  values (p_guest_id, v_choice, 1)
  on conflict (guest_id) do update set choice = excluded.choice, version = meal.version + 1
  returning meal.* into v_saved;
  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.planner_load_guest_meals(text) from public, anon, authenticated;
revoke all on function public.planner_set_guest_meal(text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.planner_load_guest_meals(text) to anon, authenticated;
grant execute on function public.planner_set_guest_meal(text, uuid, text, integer) to anon, authenticated;
