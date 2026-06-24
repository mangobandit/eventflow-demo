/*
  Private planner configuration.
  1. Create a Supabase project.
  2. Run supabase/schema.sql.
  3. Add Matt and Cara to public.allowed_users.
  4. Paste the project URL and public anon key below.

  The anon key is designed for browser use. Data protection comes from Supabase
  Row Level Security, not from hiding this file.
*/
window.MXC_CONFIG = Object.freeze({
  supabaseUrl: "",
  supabaseAnonKey: "",
  siteUrl: "https://mxcwedding.com",
  guestContentRefreshMinutes: 15
});
