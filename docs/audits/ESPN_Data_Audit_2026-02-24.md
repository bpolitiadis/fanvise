# ESPN Data & AI Pipeline — Full-Stack Audit

**Date:** 2026-02-24  
**Author:** Senior Full-Stack Engineer  
**Scope:** ESPN league data fetch → mapping → storage → AI tool usage; ESPN news fetch → storage → RAG search  
**Trigger:** Proactive quality review before scaling to multiple leagues

---

## Executive Summary

A systematic audit of every layer that touches ESPN data identified **15 issues across two tracks** (league data and news data). Three P0 bugs were fixed immediately:

| ID | Issue | Fix Applied |
|----|-------|------------|
| **A6** | `get_free_agents` tool description told the LLM `1=PG` but ESPN uses `0=PG` — every AI-driven position filter returned the wrong position | ✅ Description corrected to match `ESPN_POSITION_MAPPINGS` |
| **N4** | `searchNews()` returned `[]` when `GOOGLE_API_KEY` was absent instead of degrading to lexical-only search — entire RAG pipeline silently failed in env without key | ✅ Early-return guard removed; vector step now skipped gracefully with lexical fallback |
| **N8** | No index on `news_items.published_at` — the `match_news_documents` RPC and all lexical queries filtered on this column causing a full table scan | ✅ Migration `20260224200000_news_published_at_index.sql` added |

Remaining P1–P3 items are tracked below and scheduled for follow-up sprints.

---

## Track 1: League Data

### 1.1 ESPN Client (`src/lib/espn/client.ts`)

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| **G1** | `getMatchups()` manually builds URL instead of using `buildLeagueUrl()` | Medium | **✅ Fixed** |
| **G2** | `rosterForCurrentScoringPeriod` passed as view string is not a valid ESPN view | High | **✅ Fixed** |
| G3 | `filterSlotIds: undefined` in JSON filter object (should be omitted) | Low | Open |
| G4 | `getLeadersForScoringPeriod()` sorts 1000+ players client-side — no server-side limit | Medium | Open |
| G5 | `getPlayerInfo` vs `getPlayerCard` — difference not documented | Low | Open |
| **G6** | `pointsFor`/`pointsAgainst` exist in ESPN `mTeam` payload but are never mapped or stored | **P1** | **✅ Fixed** |

### 1.2 Mappers (`src/lib/espn/mappers.ts`)

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| M1 | `scoringSettings` typed `Record<string, unknown>` — no numeric validation before optimizer use | High | Open |
| M2 | `positionalRatings` / `liveScoring` are fetched and stored but never consumed by any AI tool | Medium | Open |
| **M3** | `pointsFor` / `pointsAgainst` not mapped (see G6) | **P1** | **✅ Fixed** |
| **M4** | `is_user_owned` check fails if `ESPN_SWID` env var is empty string | Medium | **✅ Fixed** |
| M5 | Draft detail falls back to `draftSettings` (config object), not draft picks | Medium | Open |

### 1.3 Database Schema

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| S1 | No roster snapshot in DB — every agent call is ESPN-dependent with no staleness fallback | High | Open |
| S2 | `leagues.last_updated_at` is not per-field — no granular freshness signal | Low | Open |
| S3 | `player_game_logs.game_date` is nullable — NULL rows silently excluded from `v_roster_value` 21-day window | High | Open |
| S4 | `daily_leaders` scoped to `league_id` — same global player/period data duplicated per league | Medium | Open |
| S5 | `league_transactions` has no structured player ID arrays — only human-readable description string | Medium | Open |
| S6 | `user_leagues` allows two users to claim the same team in the same league | Medium | Open |
| S7 | `leagues` RLS policy universally readable — `teams` JSONB includes manager names | Low | Open |

### 1.4 AI Tool Usage (`src/agents/shared/tool-registry.ts`)

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| **A1** | `processTransactions()` parameter typed as `any[]` | Medium | **✅ Fixed** |
| A2 | `avgPoints: 0` for injured players with 0 games can trigger incorrect drop recommendations | Medium | Open |
| **A3** | `get_league_standings` reads stale DB; `get_team_season_stats` reads live ESPN — data can contradict | **P1** | **✅ Fixed** |
| **A6** | `positionId` description off-by-one (`1=PG` vs correct `0=PG`) | **P0** | **✅ Fixed** |
| **A5** | `simulateMoveTool` hardcodes `injuryStatus: "ACTIVE"` for the drop player | **P1** | **✅ Fixed** |
| A7 | `leagueAvgFpts` computed from own roster only, not league-wide pool | Medium | Open |
| A8 | `formatSnapshotForPrompt()` omits freeAgents, transactions, schedule from prompt | Medium | Open |

### 1.5 Constants (`src/lib/espn/constants.ts`)

- Stat IDs 43 (`TW`) and 44 (`FTR`) are present but not in the ESPN reference — possibly phantom.
- Position slot `14: 'HOT'` is undocumented for `fba`; comment acknowledges uncertainty.
- Position slot `15: 'Rookie'` also undocumented — may be keeper/dynasty-league-specific.

---

## Track 2: News Data

### 2.1 Ingestion (`src/services/news.service.ts`)

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| **N1** | `Underdog NBA` feed has placeholder URL — throws parse error on every sync | **P1** | **✅ Fixed** |
| N2 | `impacted_player_ids` field populated with player **names**, not IDs | Medium | Open |
| N3 | AI-extracted `trust_level` is extracted but never applied (gatekeeper commented out) | Low | Open |
| **N4** | `searchNews()` returned `[]` when `GOOGLE_API_KEY` missing — entire RAG pipeline silenced | **P0** | **✅ Fixed** |
| N5 | ESPN/Rotowire fill the 50-item cap before later feeds (RealGM, SportsEthos) are processed | Medium | Open |
| N6 | `backfillNews()` uses un-authenticated public ESPN endpoint — no fantasy context | Low | Open |
| N7 | Supabase `.or()` filter with raw URL strings may break on URLs containing special characters | Medium | Open |

### 2.2 Database (`news_items`, `player_status_snapshots`)

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| **N8** | No index on `news_items.published_at` — full table scan before every vector search | **P0** | **✅ Fixed** |
| N9 | No HNSW index on `news_items.embedding` — O(n) cosine scan at scale | Medium | Open (defer to >5k rows) |
| **N10** | `news_items.impacted_player_ids` column name lies — stores names not IDs | High | **✅ Fixed** |
| N11 | `player_status_snapshots.expected_return_date` typed as `date`, should be `timestamptz` | Low | Open |
| N12 | No mechanism to expire stale `player_status_snapshots` — OUT players stay OUT forever | Medium | Open |

### 2.3 RAG Search Quality

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| **N13** | Vector and lexical searches are sequential — can be parallelised with `Promise.all` | Medium | **✅ Fixed** |
| N14 | `trust` weight is only 3% of hybrid score — low-trust articles can outrank ESPN | Medium | Open |
| N15 | `full_content` fetched from ESPN but truncated to 600 chars before being passed to LLM | Medium | Open |

---

## P0 Fix Details

### A6 — Position ID Description Corrected

**File:** `src/agents/shared/tool-registry.ts`

**Before:**
```
"ESPN position ID to filter by (1=PG, 2=SG, 3=SF, 4=PF, 5=C)"
```

**After:**
```
"ESPN position slot ID to filter by: 0=PG, 1=SG, 2=SF, 3=PF, 4=C, 5=G, 6=F. Matches ESPN_POSITION_MAPPINGS exactly."
```

The previous description was off by one across every position. Any AI-driven `positionId` filter call would retrieve SG when asked for PG, SF when asked for SG, etc.

---

### N4 — `searchNews()` Lexical Fallback

**File:** `src/services/news.service.ts`

Removed the early-return guard (`if (!GOOGLE_API_KEY) return []`). The function now:
1. Attempts embedding generation if `GOOGLE_API_KEY` is present.
2. If embedding fails (missing key or provider error), logs a warning and sets `embedding = null`.
3. Skips the `match_news_documents` RPC when `embedding` is null.
4. Always proceeds to the lexical retrieval path — results are still returned.

This means the RAG pipeline now degrades gracefully to keyword search in any environment that lacks a Gemini API key (e.g., local dev without `.env.local`, CI, staging).

---

### N8 — `news_items.published_at` Index

**File:** `supabase/migrations/20260224200000_news_published_at_index.sql`

Added two indexes:
- `idx_news_items_published_at (published_at DESC)` — accelerates the date-window filter in `match_news_documents` RPC and all lexical queries.
- `idx_news_items_source_published_at (source, published_at DESC)` — supports per-source freshness queries and the upcoming user news preferences feature.

---

## P1 Sprint — Completed

All lower-risk P1 items resolved:

| ID | Fix | Status |
|----|-----|--------|
| N1 | Skip Underdog NBA placeholder feed | ✅ Done |
| A5 | Pass actual injury status for drop player in `simulateMoveTool` | ✅ Done |
| A3 | Unified data source metadata across standings tools | ✅ Done |
| G6/M3 | Map `pointsFor`/`pointsAgainst` from ESPN into DB and AI tools | ✅ Done |

## P2 Sprint Complete

All code-only and schema-change P2 items have been resolved:

| ID | Fix | Status |
|----|-----|--------|
| G1 | `getMatchups()` uses `buildLeagueUrl()` | ✅ Done |
| G2 | Removed invalid `rosterForCurrentScoringPeriod` view | ✅ Done |
| M4 | `is_user_owned` trims ESPN_SWID env var | ✅ Done |
| N13 | Vector + lexical search parallelised with `Promise.all` | ✅ Done |
| A1 | `processTransactions()` typed via `EspnTransaction` interfaces | ✅ Done |
| N10 | Renamed `impacted_player_ids` → `impacted_player_names` (migration + code) | ✅ Done |
| S1 | Added `roster_snapshot` + `roster_snapshot_at` to `leagues` (migration + code) | ✅ Done |
| S3 | `game_date` now resolved from `nba_schedule` on every game log write | ✅ Done |

---

## Deep Data Audit — 2026-02-25

**Scope:** Full-stack re-audit of the ESPN data pipeline from client through mappers, services, and agent tools.

### New Critical Bugs Found & Fixed

| ID | Issue | Severity | Fix |
|----|-------|----------|-----|
| **DA1** | `EspnClient` constructor defaulted `sport` to `"ffl"` (football) instead of `"fba"` (basketball) — every API call to a newly constructed client hit the wrong sport endpoint | **P0** | Default changed to `"fba"` |
| **DA2** | `EspnClient.getFreeAgents()` — `positionId=0` (Point Guard) treated as falsy in `positionId ? {...} : undefined`, causing PG filter to be silently dropped | **P0** | Changed to `typeof positionId === "number"` check |
| **DA3** | `sync-league.ts` never stored `draft_detail`, `positional_ratings`, `live_scoring`, `roster_snapshot`, or `roster_snapshot_at` — most league JSONB fields were always `null` | **P1** | Refactored to use `mapEspnLeagueData()` and store all fields |
| **DA4** | `PlayerService.mapEspnPlayerToContext()` stored raw numeric pro team ID as `proTeam` (e.g. `"13"`) instead of the abbreviation (`"LAL"`) — confusing for LLM context | **P1** | Now resolves via `ESPN_PRO_TEAM_MAP` and stores both `proTeam` + `proTeamId` |
| **DA5** | `DailyLeadersService.extractStatsForPeriod()` did not filter on `statSplitTypeId=1` — could select projected or season-total stats instead of per-game actuals | **P1** | Added explicit `statSplitTypeId===1` + `statSourceId===0` priority filter |
| **DA6** | `DailyLeadersService` used `appliedAverage` as fallback for `fantasyPoints` on a single game — misleading metric | **P1** | Returns `null` when both `appliedStatTotal` and `appliedTotal` are missing |
| **DA7** | Team names inconsistently constructed (some used `name`, some `location+nickname`, some raw strings) across services, actions, and tools | **P1** | Centralised `resolveTeamName()` utility used everywhere |
| **DA8** | Tool registry: 4 tools used `Number(player.proTeam)` which returns `NaN` after DA4 fix changed `proTeam` to abbreviation | **P0** | Changed to `player.proTeamId ?? Number(player.proTeam)` |
| **A8** | `formatSnapshotForPrompt()` omitted free agents, transactions, and schedule data from prompt context | Medium | Now includes all snapshot sections |

### Test Coverage Added

6 new test files (92 tests total) covering the fixed code paths:

| File | Tests | Coverage |
|------|-------|----------|
| `src/lib/espn/mappers.test.ts` | 24 | `resolveTeamName`, `mapEspnLeagueData`, team/player mapping |
| `src/lib/espn/constants.test.ts` | 12 | Stat/position/pro-team map completeness |
| `src/lib/espn/client.test.ts` | 15 | Constructor defaults, URL building, filter construction |
| `src/services/player.service.test.ts` | 11 | `proTeam` resolution, free agent mapping |
| `src/services/daily-leaders.service.test.ts` | 13 | Stat extraction priority, fantasy points fallback |
| `src/services/game-log.service.test.ts` | 17 | Game log parsing, stat period filtering |
