-- Add ESPN league/team fields and INSERT policy to user_settings.
-- The table itself was created in 20260215100000_user_settings_auth.sql.

alter table public.user_settings
  add column if not exists espn_league_id text,
  add column if not exists espn_team_id   text;

-- INSERT policy was missing from the original migration.
drop policy if exists "Users can insert own settings" on public.user_settings;
create policy "Users can insert own settings"
on public.user_settings
for insert
to authenticated
with check (auth.uid() = user_id);
