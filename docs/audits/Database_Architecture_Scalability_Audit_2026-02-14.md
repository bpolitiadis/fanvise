# Database Architecture and Scalability Audit (ESPN -> Supabase)

Date: 2026-02-14  
Role: Principal Database Architect and Data Engineer  
Scope: `supabase/migrations/`, sync pipeline, league perspective path, and RAG retrieval path

## Executive Verdict

The current FanVise data layer is a strong MVP for single-league decision support, but it has scale-limiting hotspots for high-frequency Sunday sync bursts and for RAG growth above 100k fragments.

- **Scalability rating (H2H Points model): 6.5 / 10**
- **Strengths:** simple upsert flow, low operational complexity, clear service boundaries.
- **Primary debt:** JSONB-heavy league model (`scoring_settings`, `roster_settings`, `teams`) and missing vector/search indexes.
- **Main risk to speed-to-decision:** retrieval misses and sync contention under burst traffic.

## What Was Audited

- **Schema:** `supabase/migrations/20260213000000_initial_schema.sql`
- **ESPN mapping/sync path:** `src/lib/espn/mappers.ts`, `src/ops/sync-league.ts`, `src/app/api/sync/route.ts`, `src/lib/espn/client.ts`
- **League context path:** `src/services/league.service.ts`, `src/utils/auth/perspective-authorization.ts`
- **RAG path:** `src/services/news.service.ts`, `match_news_documents` RPC

## Critical Findings

### 1) Normalization vs Flexibility (JSONB in `leagues`)

Current model:
- `leagues.scoring_settings` (JSONB)
- `leagues.roster_settings` (JSONB)
- `leagues.teams` (JSONB array)

Assessment:
- **Good for write simplicity and ESPN payload fidelity.**
- **Weak for cross-league analytics and high-cardinality filters** (for example, efficiency audits over thousands of players/teams) because JSONB extraction is CPU-heavy and not planner-friendly without expression indexes.
- `teams` embedded as JSONB causes repeated de/serialization in app logic and prevents efficient relational joins for league-wide scans.

Recommendation:
- Keep JSONB as source-of-truth snapshot for ingestion speed.
- Add **relational projection tables** for analytics/query-heavy operations:
  - `league_scoring_rules(league_id, stat_id, points, season_id, updated_at)`
  - `league_roster_slots(league_id, slot_id, slot_count, season_id, updated_at)`
  - `league_teams(league_id, team_id, name, abbrev, manager, wins, losses, ties, is_user_owned, updated_at)`
- Refresh these projection tables during sync in the same transaction.

### 2) Sync Bottlenecks and Race Conditions (`sync-league.ts`)

Observed behavior:
- Single `upsert` of league row (including JSONB payloads), then transaction sync.
- No explicit advisory lock or idempotency key for sync job instances.
- ESPN calls are direct; retry logic is present in some read paths but not robustly centralized for all sync operations.

Risk profile:
- **Concurrent sync invocations** can overlap, causing last-writer-wins on `teams`/settings snapshots.
- Burst windows (Sunday mornings) can trigger ESPN throttling (429/403 patterns), increasing stale-context risk.
- Transaction sync loops row-by-row upserts; acceptable now, but will become IO-heavy as history grows.

Recommendation:
- Wrap league+transaction sync in a DB transaction and acquire advisory lock per `(league_id, season_id)`.
- Add sync run table (`league_sync_runs`) with status and idempotency token.
- Add staged backoff with jitter for ESPN calls and max-attempt caps.
- Batch transaction writes via temp table + single merge/upsert statement.

### 3) RAG Scaling (`news_items`, `match_news_documents`)

Observed behavior:
- Table uses `embedding vector(768)`.
- RPC runs similarity and recency filter, but no dedicated vector index exists in migration.
- Only `guid` index exists; no `published_at`, no FTS index, no vector ANN index.

Impact at 100k+ fragments:
- Vector queries degrade toward sequential scans without ANN index.
- Recency filter cannot prune fast without `published_at` index.
- Hybrid lexical fallback will also degrade without text search index.
- Documentation claims 1536 in places, but schema is 768: **dimension drift risk** between model config and DB type.

Recommendation:
- Lock one embedding dimension contract (768 or 1536) across AI provider config, code, and schema.
- Add ANN vector index + time index + FTS index.
- Move to chunk-level storage for long articles (`news_documents` + `news_fragments`) before 250k rows.

### 4) Perspective Engine and `user_leagues`

Observed behavior:
- Authorization checks filter `user_leagues` by `(user_id, team_id)`.
- `user_leagues` has `unique(user_id, league_id)` but no tuned index for current access pattern.
- No recursive CTEs currently used for perspective resolution.

Assessment:
- **No recursive query depth risk today** (there is no recursive SQL path).
- For league-wide analysis, current bottleneck is not recursion; it is JSONB-stored team data and missing league-oriented indexes.

Recommendation:
- Add index for auth/perspective lookup and league fan-out:
  - `(user_id, team_id, is_active desc)`
  - `(league_id, user_id)`
- Keep perspective resolution relational, but move league-wide analysis onto relational `league_teams` projection.

## Architectural Debt Register

1. **JSONB filter pain (high):** `teams`, scoring, and roster slot queries require JSON traversal instead of native joins.
2. **Index debt (high):** missing vector/time/text indexes on `news_items`.
3. **Dimension contract drift (high):** docs mention 1536 while schema enforces 768.
4. **Sync orchestration debt (medium-high):** no advisory lock/idempotency guard for overlapping jobs.
5. **Operational observability debt (medium):** no explicit sync SLA metrics table for stale-context detection.

## Optimization Roadmap (Supabase-First)

### Phase 0 (Immediate, 1-2 days)

1. Add core indexes:
```sql
create index if not exists news_items_published_at_idx
  on public.news_items (published_at desc);

create index if not exists user_leagues_user_team_active_idx
  on public.user_leagues (user_id, team_id, is_active desc);

create index if not exists user_leagues_league_user_idx
  on public.user_leagues (league_id, user_id);
```

2. Add vector ANN index (prefer HNSW if available):
```sql
-- Preferred on newer pgvector
create index if not exists news_items_embedding_hnsw_idx
  on public.news_items
  using hnsw (embedding vector_cosine_ops);

-- Fallback for older pgvector
-- create index if not exists news_items_embedding_ivfflat_idx
--   on public.news_items
--   using ivfflat (embedding vector_cosine_ops) with (lists = 200);
```

3. Add lexical index for hybrid search:
```sql
create index if not exists news_items_fts_idx
  on public.news_items
  using gin (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, '') || ' ' || coalesce(player_name, '')
    )
  );
```

### Phase 1 (Near-term, 3-7 days)

1. Introduce projection tables for JSONB flattening:
```sql
create table if not exists public.league_scoring_rules (
  league_id text not null references public.leagues(league_id) on delete cascade,
  season_id text not null,
  stat_id text not null,
  points numeric not null,
  updated_at timestamptz not null default now(),
  primary key (league_id, season_id, stat_id)
);

create table if not exists public.league_roster_slots (
  league_id text not null references public.leagues(league_id) on delete cascade,
  season_id text not null,
  slot_id text not null,
  slot_count int not null,
  updated_at timestamptz not null default now(),
  primary key (league_id, season_id, slot_id)
);
```

2. Add sync lock and idempotency:
```sql
-- inside sync transaction
select pg_try_advisory_xact_lock(hashtext(:league_id || ':' || :season_id));
```

3. Batch transaction upserts (set-based SQL) instead of per-row network roundtrips.

### Phase 2 (Scale prep, 2-4 weeks)

1. Split article and fragments for RAG:
  - `news_documents` (article-level metadata)
  - `news_fragments` (chunk text, embedding, fragment metadata)

2. Partition by time when row volume increases:
```sql
-- monthly range partitions for fragment table
-- keep hot partitions small, improve vacuum and retention.
```

3. Add retention policy (for example 90-180 day fragments) while keeping article summaries for long-term trend analytics.

## ESPN-Specific Improvements (Hidden API Quirks)

1. **SWID/S2 session resilience**
   - Validate cookie format at startup (non-empty, expected token shape).
   - Add health check endpoint that performs a lightweight ESPN call and reports auth validity.
   - Track last successful ESPN auth timestamp and trigger alert on repeated 401/403.

2. **Rate-limit survival**
   - Exponential backoff with jitter (`base=500ms`, `max=20s`, max attempts 5).
   - Respect per-endpoint concurrency caps (for example 1-2 concurrent calls per league).
   - Cache stable endpoints (`mSettings`) longer than volatile ones (`mTransactions2`, `mMatchupScore`).

3. **Deterministic sync windows**
   - Add time-sliced sync cadence:
     - pre-lock: every 5 min
     - lock window: every 60-90 sec
     - post-lock: every 10 min
   - Enforce single active sync per league using advisory lock.

4. **Schema contract guard**
   - Persist `provider`, `model`, and `embedding_dim` per row/batch to prevent hidden drift between Gemini/Ollama settings and DB vector type.

## Final Recommendations for Speed to Decision

Priority order:
1. Add vector/time/text indexes and user_leagues access indexes.
2. Enforce sync locking + retries + idempotency.
3. Introduce relational projections for scoring/roster/team analytics.
4. Upgrade RAG to chunk-level storage before crossing 250k fragments.

If only one change can be shipped this week, ship **index + sync lock** first. It yields the fastest reliability and latency gains with minimal product risk.
