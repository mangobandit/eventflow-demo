-- Tighten helper RPC privileges after adding guest self-selection.
-- Public browser access should use only the list/get/submit wrapper functions.

revoke all on function public.rsvp_invitation_payload(uuid) from public, anon, authenticated;
revoke all on function public.submit_rsvp_for_invitation(uuid, jsonb, text, text, text) from public, anon, authenticated;

revoke all on function public.list_guest_checkin_options() from public, anon, authenticated;
revoke all on function public.get_rsvp_invitation_by_lookup(text) from public, anon, authenticated;
revoke all on function public.submit_rsvp_by_lookup(text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.get_rsvp_invitation(text) from public, anon, authenticated;
revoke all on function public.submit_rsvp(text, jsonb, text, text, text) from public, anon, authenticated;

grant execute on function public.list_guest_checkin_options() to anon, authenticated;
grant execute on function public.get_rsvp_invitation_by_lookup(text) to anon, authenticated;
grant execute on function public.submit_rsvp_by_lookup(text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.get_rsvp_invitation(text) to anon, authenticated;
grant execute on function public.submit_rsvp(text, jsonb, text, text, text) to anon, authenticated;
