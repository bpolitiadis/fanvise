# API Services & AI Agents

FanVise uses a **single agentic AI architecture**. All intelligence requests flow through:
- **Agentic mode** (`POST /api/agent/chat`): LangGraph Supervisor with tool-calling for iterative, data-grounded analysis across all query types.

## Chat Endpoint (`POST /api/agent/chat`)

### Optimizer Stream Protocol (Phase 3)

When the optimizer path fires, the API stream carries two special tokens:

| Token | Purpose |
|---|---|
| `[[FV_STREAM_READY]]` | Heartbeat — sent immediately so the connection isn't dropped |
| `[[FV_MOVES:BASE64]]` | Structured move payload — appended after all text content |

The frontend (`chat-interface.tsx`) strips both tokens before rendering. `[[FV_MOVES:BASE64]]` decodes to `MovesStreamPayload` (`src/types/optimizer.ts`), which is attached to the `ChatMessage` and rendered as `MoveCard` components.

**`evalMode` JSON response** also includes `rankedMoves: MoveRecommendation[]` for programmatic/evaluation use.

### Supervisor Routing (Phase 2)

The Supervisor now acts as a **router** with two execution paths:

```
__start__ → classify_intent (deterministic, no LLM) → routeAfterClassify
                                                         │
                  ┌──────────────────────────────────────┴──────────────────────┐
                  ▼                                                              ▼
     lineup_optimization + team context                             all other intents
                  │                                                              │
        LineupOptimizerGraph                                        ReAct agent loop
        (6 nodes, 1 LLM call)                                (existing tool-calling flow)
                  │                                                              │
               synthesize ──────────────────────────────────────────────── synthesize
                  │                                                              │
                 END                                                            END
```

**`LineupOptimizerGraph` nodes (all deterministic except the last):**
1. `parse_window` — extract optimization window dates
2. `gather_data` — `Promise.all`: roster + schedule + free agents + league config
3. `score_candidates` — `scoreDroppingCandidate` + `scoreStreamingCandidate` (pre-loaded schedule)
4. `simulate_moves` — `simulateMove` on top candidate pairs (pre-loaded schedule, zero extra queries)
5. `rank_moves` — sort by `netGain` desc
6. `compose_recommendation` — single focused LLM call in FanVise GM voice

Agentic mode uses the supervisor graph (`src/agents/supervisor/agent.ts`) to choose tools dynamically based on the user query.

This mode is best for deep-dive questions where the model must combine multiple lookups and reasoning steps before answering.

## Chat Route Behavior

The agent route applies these core safety and delivery patterns:
- **Perspective authorization** through `authorizePerspectiveScope` (`src/utils/auth/perspective-authorization.ts`) before building league/team context.
- **Stream heartbeat token** (`[[FV_STREAM_READY]]`) so clients/proxies receive immediate bytes during slow context assembly or local model startup.
- **Eval mode support** (`evalMode=true`) with structured debug output in development workflows.

## Core Foundation Services

- **AI Service (`src/services/ai.service.ts`)**: Provider-agnostic model gateway for streaming, embeddings, and environment-based routing (Gemini or Ollama).
- **Prompt Engine (`prompts/index.ts`)**: Builds strict, context-grounded General Manager instructions.
- **League Service (`src/services/league.service.ts`)**: Aggregates ESPN + Supabase data into an intelligence snapshot.
- **News Service (`src/services/news.service.ts`)**: Manages ingestion, intelligence extraction, and vector retrieval.
- **Daily Leaders Service (`src/services/daily-leaders.service.ts`)**: Provides per-period performance context for chat and sync flows.
- **Optimizer Service (`src/services/optimizer.service.ts`)**: **Phase 1 — Deterministic lineup math engine.** Zero LLM calls. Functions: `scoreDroppingCandidate`, `scoreStreamingCandidate`, `buildDailyLineup`, `validateLineupLegality`, `simulateMove`. Backed by `v_roster_value` and `v_streaming_candidates` DB views.

## Agentic Tool Registry (`src/agents/shared/tool-registry.ts`)

The Supervisor and specialized agents share 14 tools:

| Tool | Purpose |
|---|---|
| `get_espn_player_status` | Live ESPN injury status for a named player |
| `get_player_news` | Vector-search news for a player |
| `refresh_player_news` | Live RSS fetch when cached news is stale |
| `get_player_game_log` | Per-game box scores for recent form analysis |
| `get_my_roster` | Roster with `dropScore` (0-100, league-relative) and `dropReasons` |
| `get_free_agents` | Waiver wire; set `includeSchedule=true` for `streamScore` + game dates |
| `get_matchup_details` | Current matchup score and games remaining |
| `get_league_standings` | W/L standings for all teams |
| `search_news_by_topic` | Broad semantic news search |
| `get_league_scoreboard` | All matchup scores for the current period |
| `get_league_activity` | Recent transaction history |
| `get_team_season_stats` | Season-aggregate team stats (PF, PA, transaction counts) |
| `simulate_move` | **NEW (Phase 1)** — Deterministic drop/add simulation: returns `netGain`, `baselineWindowFpts`, `projectedWindowFpts`, `isLegal` |
| `validate_lineup_legality` | **NEW (Phase 1)** — Checks daily lineup slot legality, identifies unfilled slots and wasted starts |

## Evaluation Suite (Standalone)

`fanvise_eval/test_fanvise.py` runs black-box checks against `/api/agent/chat`:
- Sends prompts from `fanvise_eval/golden_dataset.json`.
- Captures output and optional `debug_context`.
- Applies deterministic policy/math checks.
- Applies optional LLM-judge metrics via `FANVISE_JUDGE_PROVIDER`.
