-- S1: Add roster_snapshot + roster_snapshot_at to leagues
-- Provides a timestamped ESPN roster fallback used when the ESPN API is
-- unreachable. The AI service layer can serve the last-known roster from
-- this column instead of failing with an empty context.

ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS roster_snapshot jsonb,
    ADD COLUMN IF NOT EXISTS roster_snapshot_at timestamptz;

-- Partial index: only index rows where a snapshot exists,
-- avoiding wasted index space for leagues that have never been synced.
CREATE INDEX IF NOT EXISTS idx_leagues_roster_snapshot_at
    ON public.leagues (roster_snapshot_at DESC NULLS LAST)
    WHERE roster_snapshot_at IS NOT NULL;
