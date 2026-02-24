# Changelog

All notable changes to FanVise are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed — ESPN Data & News Pipeline P2 schema + code (2026-02-24)

- **[N10] `impacted_player_ids` renamed to `impacted_player_names`** — The column has always stored player names, not ESPN integer IDs. Migration `20260224210000` renames the column and recreates the `match_news_documents` RPC with the corrected return type. All TypeScript references in `news.service.ts` updated. (`supabase/migrations/20260224210000_rename_impacted_player_ids.sql`, `src/services/news.service.ts`)

- **[S1] `roster_snapshot` fallback on `leagues`** — Added `roster_snapshot jsonb` and `roster_snapshot_at timestamptz` columns to the `leagues` table. The league upsert now writes a timestamped snapshot of the full teams/roster array on every ESPN sync, giving the AI service layer an offline fallback when ESPN is unreachable. (`supabase/migrations/20260224220000_leagues_roster_snapshot.sql`, `src/types/league.ts`, `src/services/league.service.ts`)

- **[S3] `game_date` always populated on game log writes** — `game-log.service.ts` now resolves `game_date` from `nba_schedule` (a single batch query per fetch) before upserting rows. Without this, `v_roster_value`'s 21-day `WHERE game_date >= ...` clause silently excluded all game log rows, making the streaming and drop-analysis tools blind to recent performance. (`src/services/game-log.service.ts`)

### Fixed — ESPN Data & News Pipeline P2 code-quality (2026-02-24)

- **[G1] `getMatchups()` URL construction** — Replaced manual URL template duplication with the shared `buildLeagueUrl()` helper, keeping all URL construction in one place. (`src/lib/espn/client.ts`)

- **[G2] Invalid ESPN view string** — Removed `'rosterForCurrentScoringPeriod'` from the `getMatchups()` call in `buildIntelligenceSnapshot`. It is not a real ESPN view and was silently ignored by the API; `mRoster` already returns full roster data. (`src/services/league.service.ts`)

- **[M4] `is_user_owned` with empty-string SWID** — The ownership check in `mapEspnLeagueData()` now trims `ESPN_SWID` before comparison, preventing false-negative team ownership when the env var is set to `""` or has accidental whitespace. (`src/lib/espn/mappers.ts`)

- **[N13] Parallelised vector + lexical news search** — `searchNews()` previously ran vector embedding → RPC → lexical queries sequentially. Lexical query now fires immediately in a `Promise.all` alongside the embedding→RPC chain, reducing P50 search latency by ~200–500 ms. (`src/services/news.service.ts`)

- **[A1] `processTransactions()` typed parameters** — Replaced `any[]` with `EspnTransaction` / `EspnTransactionItem` interfaces, eliminating all `any` in the transactions pipeline. (`src/services/league.service.ts`)

### Fixed — ESPN Data & News Pipeline P1 (2026-02-24)

- **[N1] Underdog NBA placeholder feed** — The Underdog NBA RSS entry had a hardcoded placeholder URL (`UNDERDOG_NBA_PLACEHOLDER.xml`) that threw a parse error on every sync cycle. The feed list now filters out any entry whose URL is empty or contains `PLACEHOLDER`. Set `UNDERDOG_NBA_RSS_URL` in env to activate the feed when a real URL is available. (`src/services/news.service.ts`)

- **[A5] `simulate_move` drop player injury status** — `simulateMoveTool` was hardcoding `injuryStatus: "ACTIVE"` for the player being dropped, causing the optimizer to project full games for injured players and inflate `baselineWindowFpts`. The tool now resolves the drop player's actual `injuryStatus`, `totalFpts`, and `gamesPlayed` from the live roster snapshot before constructing the optimizer input. (`src/agents/shared/tool-registry.ts`)

- **[A3] Standings vs season stats data source contradiction** — `get_league_standings` (DB cache) and `get_team_season_stats` (live ESPN) both returned wins/losses but could diverge when the DB was stale, with no way for the LLM to know which was authoritative. Both tools now explicitly declare their `dataSource` in the response (`"DB_CACHE"` / `"ESPN_LIVE"`), `get_league_standings` exposes `lastSyncedAt`, and both descriptions state their data source and when to prefer each other. (`src/agents/shared/tool-registry.ts`)

- **[G6/M3] `pointsFor`/`pointsAgainst` mapped from ESPN** — `record.overall.pointsFor` and `record.overall.pointsAgainst` existed in the ESPN `mTeam` payload but were never extracted. These fields are now mapped in `mapEspnLeagueData()`, stored in the `leagues.teams` JSONB blob on every sync, typed on `DbTeam`, and exposed by `get_league_standings` (with tiebreaking on PF). (`src/lib/espn/mappers.ts`, `src/types/league.ts`, `src/agents/shared/tool-registry.ts`)

### Fixed — ESPN Data & News Pipeline P0 (2026-02-24)

- **[A6] `get_free_agents` position filter** — The `positionId` parameter description told the LLM `1=PG, 2=SG, ...` but ESPN's `POSITION_MAPPINGS` starts at `0=PG`. Every AI-driven position filter call was returning the wrong position. Description now reads `0=PG, 1=SG, 2=SF, 3=PF, 4=C, 5=G, 6=F` to match `ESPN_POSITION_MAPPINGS` exactly. (`src/agents/shared/tool-registry.ts`)

- **[N4] `searchNews()` lexical fallback** — `searchNews()` previously returned an empty array (`[]`) when `GOOGLE_API_KEY` was absent, silently killing the entire RAG pipeline in any environment without the key (local dev, CI, staging). The early-return guard is removed. The embedding step is now skipped gracefully when the key is missing or the provider returns an error, and the function always proceeds to the lexical keyword search path. (`src/services/news.service.ts`)

- **[N8] `news_items.published_at` index** — All news queries (vector RPC and lexical search) filter by `published_at` but had no index on that column, causing a full sequential scan with every search. Added `idx_news_items_published_at (published_at DESC)` and a composite `idx_news_items_source_published_at (source, published_at DESC)` for per-source freshness queries. (`supabase/migrations/20260224200000_news_published_at_index.sql`)

- **[Audit] ESPN Data & News Pipeline** — Full-stack audit of ESPN data fetch → mapping → storage → AI usage, and news ingestion → storage → RAG search. 15 issues identified across two tracks. See `docs/audits/ESPN_Data_Audit_2026-02-24.md`.

### Added — 2026-02-24

- **CHANGELOG.md** — Project changelog initialized (24 Feb 2026).
- **docs/REVIEW_2026-02-24.md** — Senior dev review of uncommitted changes, stability assessment, and logical commit breakdown.
- **Settings** — User settings page with ESPN League/Team IDs, Gemini API key, news source preferences. Per-user config with DB → env fallback.
- **LangGraph agents** — Supervisor agent with tool routing; Player Research agent (live ESPN status + news). `/api/agent/chat` endpoint.
- **Chat mode toggle** — Switch between Classic (single-pass RAG) and Agent (Supervisor) mode. Toaster notifications.
- **News enhancements** — ESPN full article fetch, `news_sources` catalog, `user_news_preferences`, `full_content` column, `news:stats` script.
- **Player game logs** — ESPN `getPlayerGameLog`, `game-log.service`, `player_game_logs` table with cache-on-read.
- **Dependencies** — `@langchain/langgraph`, `@langchain/google-genai`, `@langchain/ollama`, `react-hook-form`, `sonner`, Radix form/label/separator/switch.

### Fixed — 2026-02-24

- **League cache key** — `unstable_cache` now includes `leagueId`, `teamId`, `seasonId` to prevent cross-user roster leakage.
- **Perspective auth** — Authenticated users resolve team from `user_leagues` or `user_settings`; no env fallback for wrong teams.

### Added — Auth Flow Refactor (2026-02-24)

- **Protected routes** — `/chat`, `/optimize`, `/league` added to middleware protection. Centralized `PROTECTED_PATH_PREFIXES`.
- **Shared logout** — `src/utils/auth/logout.ts` with `signOutAndRedirect()` for consistent session cleanup.
- **Auth tests** — Playwright API tests (callback redirects, protected route, login page); E2E tests (login, logout, dashboard, guards); auth setup via Dev Login.
- **Auth UX** — Toast notifications for errors; `sanitizeAuthError()`; `Label` component; dev login respects `next` param.

### Fixed — Auth (2026-02-24)

- **Middleware** — Removed redundant `request.cookies.set` in `setAll`; cookie options correctly applied on response.
- **Email auth** — Signup `emailRedirectTo` now encodes `next` path; error handling sanitizes messages.
