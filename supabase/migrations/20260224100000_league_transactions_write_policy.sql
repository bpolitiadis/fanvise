-- Allow server-side writes to league_transactions and leagues.
-- These tables are written to exclusively by server actions / API routes.
-- Reads are already covered by the existing SELECT-only policies.

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'league_transactions'
    and policyname = 'Service role can manage transactions'
  ) then
    create policy "Service role can manage transactions"
    on public.league_transactions for all
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'leagues'
    and policyname = 'Service role can manage leagues'
  ) then
    create policy "Service role can manage leagues"
    on public.leagues for all
    using (true)
    with check (true);
  end if;
end $$;
