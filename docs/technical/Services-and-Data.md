# Foundation Services & Data Models

FanVise separates deterministic execution (logic, math, API fetching) entirely from the generative AI reasoning loop. The `src/services` layer handles these rigid tasks, translating raw JSON endpoints and SQL rows into strongly typed interfaces ready for the LangGraph context windows.

## ⚙️ The Core Services Layer

### 1. `LeagueService`
The "Eyes" of the Strategist. It builds comprehensive `IntelligenceSnapshots`.
* **Execution**: It fetches user roster rules and schedules from Supabase, then makes live calls to the ESPN Matchup API to inject current scoring realities.
* **`mapRoster()`**: Transforms raw ESPN roster entries into typed `Player` objects. Each player gets:
  - `proTeam`: Abbreviation (e.g. `"LAL"`) resolved via `ESPN_PRO_TEAM_MAP`.
  - `proTeamId`: Numeric ESPN team ID retained for schedule lookups.
* **`calculateScheduleDensity()`**: Uses `proTeamId` (numeric) to join players against the `nba_schedule` table — never parses abbreviation strings.
* **`toTeamContext()`**: Includes `pointsFor` and `pointsAgainst` from ESPN `record.overall` to give the LLM season-level scoring context.
* **`formatSnapshotForPrompt()`**: Renders the full snapshot as an LLM prompt section including roster, free agents, transactions, and schedule summaries.
* **Result**: Generates a strictly typed context payload allowing the AI to know if the user is winning by 30 points or losing by 2 points before it opens its mouth.

### 2. `DailyLeadersService`
Responsible for interpreting yesterday's (or today's) standout fantasy performances.
* **Execution**: Resolves specific dates to ESPN `scoringPeriodId` increments using `nba_schedule`. Fetches the leaders from ESPN, caches them into `daily_leaders`, and builds a stringed context overview.
* **`extractStatsForPeriod()`**: Correctly prioritizes `statSourceId=0` (actual) and `statSplitTypeId=1` (per-period) stat entries. Falls back to season totals only if per-period data is absent. Fantasy points come from `appliedStatTotal`; if absent, returns `null` instead of misleading averages.
* **Usage**: Extremely vital for waiver wire recommendations when a user asks "Who overperformed last night?" 

### 3. `OptimizerService`
The Deterministic Math Engine. **This service contains zero LLM calls.**
* **Execution**: Pure calculation pipelines that can be unit-tested. Handles:
  * Scoring active players as drop candidates (relative to league averages).
  * Scoring free agents as streaming candidates (projecting schedule volume vs fantasy points).
  * Simulating "Drop A, Add B" transactions by simulating legal lineups over the upcoming schedule window to calculate `netGain` values.
* **Interface**: The LLM within `LineupOptimizerGraph` calls these native calculation functions as tools and translates the raw numerical differences into human-readable advice.

### 4. `PlayerService`
Wraps the ESPN client for player-specific operations (free agents, player cards).
* **`getTopFreeAgents()`**: Fetches available players via `kona_player_info`. Each player's `proTeam` is resolved from the numeric `proTeamId` via `ESPN_PRO_TEAM_MAP` (not the raw integer string).
* **`mapEspnPlayerToContext()`**: Maps raw ESPN player data to the application `Player` type, setting both `proTeam` (abbreviation) and `proTeamId` (numeric).

### 5. `GameLogService`
Fetches per-game box scores from ESPN `kona_playercard` and caches them in `player_game_logs`.
* Uses `statSourceId=0` and `statSplitTypeId=1` to extract actual per-scoring-period stats.
* Past scoring periods are cached indefinitely; current period has a 15-minute TTL.

### 6. `TransactionService`
Processes ESPN `mTransactions2` data into structured transaction history.
* Team names resolved via `resolveTeamName()` for consistency.
* Stored in `league_transactions` with typed player arrays.

## 🔧 Shared Utilities

### `resolveTeamName()` (`src/lib/espn/mappers.ts`)
Centralised team name construction used across all service and tool layers. Prioritizes `location + nickname` over the potentially stale `name` field from ESPN. Ensures consistent naming in the DB, prompts, and tool responses.

### `mapEspnLeagueData()` (`src/lib/espn/mappers.ts`)
Comprehensive mapper that transforms raw ESPN league JSON into a typed `MappedLeagueData` object, handling teams, rosters, scoring settings, draft detail, positional ratings, live scoring, and roster snapshots in one pass.

## 🗄️ Core Database Schemas & Migrations

Supabase handles persistence via PostgreSQL. FanVise utilizes `pgvector` for embedding logic.

### `leagues`
Central repository for ESPN league metadata.
*   **Columns:** `league_id`, `name`, `season_id`, `scoring_settings` (JSONB), `roster_settings` (JSONB), `draft_detail` (JSONB), `positional_ratings` (JSONB), `live_scoring` (JSONB), `roster_snapshot` (JSONB), `roster_snapshot_at` (timestamptz), `teams` (JSONB array with `wins`, `losses`, `ties`, `pointsFor`, `pointsAgainst` per team).
*   **Sync:** Populated by `src/ops/sync-league.ts` via `mapEspnLeagueData()`.

### `news_items` (`20260213000000_initial_schema.sql`)
The heart of the unstructured RAG pipeline.
*   **Columns:** `title`, `summary`, `full_content`, `category`, `impact_backup`, `injury_status`.
*   **Vectorization:** Holds a native `vector(768)` dimension column for fast semantic querying via the `match_news_documents` RPC.
*   **Deduplication:** Utilizes a `guid` to prevent RSS syndicates from flooding identical stories.

### `player_status_snapshots` (`20260214010000_player_status_snapshots.sql`)
Canonical player states representing injury constraints.
*   **Execution**: Decoupled from full roster intelligence syncs, snapshots allow fast caching of a player's `injury_status` and `expected_return_date`.
*   **Rationale**: The Optimizer needs to instantly know who is definitively "OUT" to avoid calculating them as viable starters for tonight's game without needing an exhaustive LLM search.

### `daily_leaders` (`20260214120000_daily_leaders.sql`)
Highly indexed table holding rolling records of top performances.
*   **Composite Keys:** `league_id`, `season_id`, `scoring_period_id`, `player_id`.

### `player_game_logs` (`20260223000000_player_game_logs.sql`)
Per-player, per-scoring-period actual box score data. Each row = one NBA game played.
*   **Key Columns:** `pts`, `reb`, `ast`, `stl`, `blk`, `turnovers`, `three_pm`, `fg_made/attempted/pct`, `ft_made/attempted/pct`, `minutes`, `fantasy_points`, `stats_raw` (JSONB).
*   **Unique on:** `(player_id, season_id, scoring_period_id)`.

## 🔗 Agent Tool Integration

All services are consumed by the AI agents via the 14-tool registry (`src/agents/shared/tool-registry.ts`). Each tool is a thin typed wrapper — it calls a service method, shapes the output, and returns it to the LLM. The tool registry uses `proTeamId` (numeric) for schedule joins, never parsing abbreviation strings.

## 🚀 Room for Improvement / Next Steps
* **Distributed Locking on `LeagueService`**: While `unstable_cache` deduplicates in-flight Next.js calls locally, a true distributed Redis-locking methodology on heavy ESPN Matchup JSON payloads could lower overall system pressure during high-traffic Sunday lock periods.
* **Supabase Webhooks & Real-Time Subscriptions**: Creating edge listeners via `pg_listen` when `player_status_snapshots` update from `ACTIVE` to `OUT`. This could directly push a notification natively to users holding that player without manual query loops.
