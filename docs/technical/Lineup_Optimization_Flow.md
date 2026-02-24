# Lineup Optimization Flow (Core Functionality)

This document defines the end-to-end process for FanVise lineup optimization and a practical implementation plan.

It is designed for the core user request:

> "For the final days of the week, scan my team, identify weak or droppable players, compare healthy free agents with favorable schedules, and recommend adds only when the roster can actually use those players on target days."

## Goals

- Maximize points in the remaining week window (typically next 2-3 days).
- Recommend realistic moves only (position-valid, schedule-valid, roster-slot-valid).
- Keep decision logic deterministic and testable.
- Use AI for orchestration and explanation, not for core math.

## Non-Goals (Initial Version)

- Fully automated transactions without user confirmation.
- Long-horizon season planning beyond the current matchup window.
- Probabilistic injury forecasting outside trusted data sources.

## Execution Flow

### 1) Intent + Window Detection

The chat layer detects optimization intent from prompts like:
- "Optimize my lineup for the last 3 days."
- "Who should I stream this weekend?"
- "Who can I drop and add for Friday-Sunday?"

Inputs:
- `teamId` (active perspective)
- `leagueId`
- `windowStart`, `windowEnd` (default now through end-of-week)

### 2) Fetch Core Data

Required reads:
- My current roster and eligible fantasy positions.
- Matchup/scoring settings.
- NBA schedule for the optimization window.
- Free-agent pool (filtered by league and availability).
- Player health/news status.

### 3) Build Candidate Sets

#### 3.1 Droppable candidates (my roster)

A player can become a drop candidate when multiple conditions hold:
- Low expected contribution in the target window.
- Schedule gaps (few/no games in the next 2-3 days).
- Role/injury uncertainty.
- Replacement-level alternative exists in free agency.

#### 3.2 Add candidates (free agents)

Filter free agents by:
- Healthy or playable status.
- Games in target window.
- Position eligibility that can fit real roster slots.
- Reasonable floor/ceiling for league scoring format.

### 4) Slot-Fit and Day-Fit Simulation

For each potential move pair (`drop A -> add B`):
- Simulate daily lineup for each day in the window.
- Validate positional legality for all starts.
- Check whether added player actually converts into extra starts (not bench-only).
- Compute point delta vs baseline.

Only keep moves with positive practical gain.

### 5) Rank and Explain

Rank by:
- Expected point gain (primary).
- Reliability/risk (injury volatility, role volatility).
- Optional tiebreakers (category scarcity, playoff relevance).

Return:
- Top recommended move set (1 to N moves).
- "Why" explanation per move.
- Alternatives if top option is unavailable.
- Confidence indicator and data freshness notes.

### 6) User Confirmation Gate

The assistant should not execute roster transactions automatically.
It should present:
- "Recommended action"
- "Expected gain"
- "Risks"
- "Approve/decline" next action

## System Design Guidance

### Do we need LangGraph?

**Yes — adopted Feb 23, 2026.** See `docs/technical/Agentic_Architecture_LangGraph.md` for the full rationale and implementation plan.

The original "No for v1" position assumed a simple "suggest top 3 adds" flow. The full matchup optimization scenario — checking both rosters, schedule analysis, identifying drop candidates, scanning free agents, validating slot fit, re-evaluating injuries, composing daily lineups — is a multi-step stateful workflow that a single system prompt cannot faithfully simulate.

**Adopted architecture:**
- `@langchain/langgraph` `StateGraph` for multi-step workflow orchestration.
- Deterministic `OptimizerService` for all math (point-delta simulation, slot legality) — no LLM for core calculations.
- Existing services (`EspnClient`, `searchNews`, `buildIntelligenceSnapshot`) wrapped as LangGraph tools.
- Human-in-the-loop confirmation gate before presenting final recommendations.
- Legacy single-pass chat (`IntelligenceService`) preserved for simple Q&A.

**What we do NOT adopt:** classic LangChain chain abstractions (`LLMChain`, `VectorstoreRetriever`, `Memory`). Only LangGraph is used.

## Proposed Service Contracts

Example internal service boundaries:

- `LeagueService.getRosterContext(leagueId, teamId)`
- `ScheduleService.getPlayerGames(playerIds, windowStart, windowEnd)`
- `FreeAgentService.getCandidates(leagueId, filters)`
- `HealthService.getStatuses(playerIds)`
- `OptimizerService.simulateMoves(input): OptimizationResult`

`OptimizerService` should be deterministic and independently testable.

## Implementation Plan

### Phase 0: Prerequisites and Data Quality

- Confirm NBA schedule source coverage and refresh cadence.
- Ensure player-to-pro-team mapping reliability.
- Enforce data freshness checks (fail safe when stale).

### Phase 1: Deterministic Optimizer Core ✅ COMPLETE (Feb 24, 2026)

**Status:** Implemented and tested.

**Delivered:**

- **`src/services/optimizer.service.ts`** — Deterministic math engine with no LLM calls.
  - `scoreDroppingCandidate(player, window, leagueAvgFpts)` → `DropScore` (0-100, league-relative)
  - `scoreStreamingCandidate(freeAgent, window)` → `StreamScore` (volume-adjusted value)
  - `buildDailyLineup(roster, rosterSlots, date, playingTeams)` → greedy slot assignment
  - `validateLineupLegality(input)` → slot legality check with unfilled/benched warnings
  - `simulateMove(drop, add, roster, slots, window)` → `SimulateMoveResult` with net gain
  - `getStreamingCandidatesFromView()` / `getRosterValueFromView()` — DB view readers

- **`supabase/migrations/20260224000000_optimizer_views.sql`** — Pre-calculated DB views:
  - `v_roster_value` — rolling 21-day per-player averages and volatility
  - `v_streaming_candidates` — free-agent pool with current-week schedule context
  - Performance indexes on `player_game_logs.game_date`, `player_status_snapshots.pro_team_id`, `nba_schedule(date, teams)`

- **Tool registry updates (`src/agents/shared/tool-registry.ts`):**
  - `get_my_roster` — replaces boolean `isDropCandidate` with numeric `dropScore` (0-100) + `dropReasons[]`
  - `get_free_agents` — adds `includeSchedule` flag that returns `gamesRemaining`, `gamesRemainingDates`, and `streamScore`
  - `simulate_move` (**NEW**) — deterministic drop/add simulation tool
  - `validate_lineup_legality` (**NEW**) — daily lineup legality checker

- **Type updates (`src/agents/shared/types.ts`):**
  - `RosterPlayerWithSchedule` — `dropScore` + `dropReasons` (replaces `isDropCandidate`)
  - `FreeAgentWithSchedule` — new type with schedule context and `streamScore`
  - `SimulateMoveOutput` — new type for tool output

- **`src/services/optimizer.service.test.ts`** — 22 unit tests, all passing.
  - `scoreDroppingCandidate`: 6 tests covering score signals, injury, schedule gaps, league-relativity
  - `scoreStreamingCandidate`: 4 tests covering volume scoring, confidence tiers, edge cases
  - `buildDailyLineup`: 3 tests covering slot assignment, OUT exclusion, bench placement
  - `validateLineupLegality`: 4 tests covering legal/illegal states, UTIL slot, wasted starts
  - `simulateMove`: 5 tests covering positive/negative netGain, legality, DTD warnings, breakdown

### Phase 2: Agent Specialization & Parallel Execution ✅ COMPLETE (Feb 24, 2026)

**Status:** Implemented. Zero TypeScript errors. All 55 tests passing.

**Delivered:**

- **`src/agents/shared/intent-classifier.ts`** — Deterministic regex classifier (saves 300-600ms per request).
  - Pure function `classifyIntent(query: string): QueryIntent`
  - 5 intent categories, ordered priority matching
  - No LLM call, no async, no DB

- **`src/agents/lineup-optimizer/state.ts`** — LangGraph `Annotation.Root` for optimizer graph state.
  - All accumulated data: roster, free agents, matchup, schedule, scores, moves
  - Pre-loaded `NbaGame[]` in state to share across nodes (zero duplicate schedule queries)

- **`src/agents/lineup-optimizer/graph.ts`** — 6-node `StateGraph`. LLM fires only once.
  - `parse_window` — extract optimization window (sync)
  - `gather_data` — `Promise.all` for roster + schedule + free agents + league config (~800ms)
  - `score_candidates` — `scoreDroppingCandidate` + `scoreStreamingCandidate` with pre-loaded games
  - `simulate_moves` — `simulateMove` on top 3×5 pairs with pre-loaded games (zero extra schedule queries)
  - `rank_moves` — sort by `netGain` desc, keep top 3 (sync)
  - `compose_recommendation` — single focused LLM call (~600ms) using `prompts/agents/optimizer.ts`
  - Error guard: if `parse_window` fails (no teamId/leagueId), skip to `compose_recommendation` with friendly message

- **`prompts/agents/optimizer.ts`** — `getOptimizerPrompt()` (EN + EL).
  - GM persona, structured "Drop X → Add Y, +Z fpts" output format
  - `## The Knife` section for the single best move

- **`src/agents/supervisor/agent.ts`** — Updated Supervisor:
  - `classifyIntentNode` is now synchronous (was `async` + LLM call)
  - New `runOptimizerNode` delegates `lineup_optimization` to `LineupOptimizerGraph`
  - New routing: `classify_intent` → `routeAfterClassify` → `run_optimizer` or `agent`
  - ReAct loop unchanged for all other intents

- **`src/agents/supervisor/prompts.ts`** — `SUPERVISOR_SYSTEM_PROMPT` updated:
  - `simulate_move` and `validate_lineup_legality` documented with usage guidance
  - `INTENT_CLASSIFIER_PROMPT` removed (no longer needed)

- **`src/agents/supervisor/tool-node-with-context.ts`** — Context injection extended:
  - `simulate_move` and `validate_lineup_legality` added to `TOOLS_NEED_TEAM_ID` and `TOOLS_NEED_LEAGUE_ID`

- **`src/services/optimizer.service.ts`** — `preloadedGames?: NbaGame[]` parameter added to:
  - `scoreDroppingCandidate`, `scoreStreamingCandidate`, `simulateMove`
  - When pre-loaded games provided, zero additional schedule DB queries per function call

**Latency improvement (estimated):**

| Scenario | Before | After |
|---|---|---|
| Intent classification | 300-600ms (Gemini LLM call) | <1ms (regex) |
| "Optimize my lineup" full flow | ~8-12s (ReAct + multiple serial tool calls) | ~2-3s (parallel gather + 1 focused LLM) |
| ReAct tool loop (other intents) | Unchanged | Unchanged |

### Phase 3: Product UX and Safety ✅ COMPLETE (Feb 24, 2026)

**Status:** Implemented. Zero TypeScript errors. All 55 tests passing.

**Architecture: Stream Sentinel Token Protocol**

The optimizer's structured move data is piped from server to client via a sentinel token appended at the end of the text stream:

```
[[FV_STREAM_READY]]...text content...[[FV_MOVES:BASE64_JSON]]
```

The frontend strips both tokens from the displayed text and uses the decoded JSON to render `MoveCard` components.

**Delivered:**

- **`src/types/optimizer.ts`** (new) — Shared client/server types.
  - `MoveRecommendation` — serializable move shape (used in supervisor state, ChatMessage, MoveCard)
  - `MovesStreamPayload` — the decoded payload structure: `{ moves, fetchedAt, windowStart, windowEnd }`

- **`src/types/ai.ts`** — `ChatMessage` extended:
  - `rankedMoves?: MoveRecommendation[]`
  - `fetchedAt?: string` (freshness indicator ISO timestamp)
  - `windowStart?: string`, `windowEnd?: string`

- **`src/agents/supervisor/state.ts`** — `rankedMoves: MoveRecommendation[]` added to Supervisor state.

- **`src/agents/supervisor/agent.ts`**:
  - `runOptimizerNode` now sets `rankedMoves` in Supervisor state from optimizer result
  - `streamSupervisor` accumulates `rankedMoves` from state chunks, then emits `[[FV_MOVES:BASE64]]` sentinel after the text stream completes
  - `SupervisorResult` and `runSupervisor` now return `rankedMoves`

- **`src/components/chat/move-card.tsx`** (new) — Rich recommendation card component.
  - `SingleMoveCard` — one DROP→ADD card with:
    - Confidence-coded border/badge (HIGH=emerald, MEDIUM=amber, LOW=orange)
    - Large net gain display (+X.X fpts) with baseline→projected breakdown
    - Drop score and stream score (0-100) for each player
    - Warning badges (injury risk, low schedule, etc.)
    - Freshness indicator ("X minutes ago")
    - "Open ESPN" button (external link to ESPN waiver wire)
    - "Done ✓" button to mark move as manually executed
    - Executed state (card dims, green checkmark)
  - `MoveCards` — container with section header and safety disclaimer

- **`src/components/chat/message-bubble.tsx`** — Renders `MoveCards` below markdown content when `message.rankedMoves` is populated. Passes `leagueId` for ESPN deep-link generation.

- **`src/components/chat/chat-interface.tsx`**:
  - `extractMovesToken()` — parses `[[FV_MOVES:BASE64]]` from stream chunks
  - Stream reading loop now extracts and strips the sentinel token
  - After stream completion, attaches `rankedMoves`, `fetchedAt`, `windowStart`, `windowEnd` to the message object
  - Passes `activeLeagueId` to `MessageBubble` for ESPN links

**Safety / Confirmation UX:**
- FanVise **never auto-executes** waiver transactions
- Each card has two explicit actions: "Open ESPN" (external link) + "Done ✓" (manual confirmation)
- Footer disclaimer: "FanVise recommends. You confirm and execute."
- The "Done ✓" button marks the card as executed locally — purely informational, no API call

### Phase 4: Evaluation and Regression Guardrails

- Add golden prompts for lineup optimization scenarios.
- Add deterministic assertion checks (no impossible slot suggestions).
- Track recommendation quality over time.

### Phase 5: LangGraph Matchup Optimizer Graph

LangGraph adopted Feb 23, 2026. This phase is now the implementation target.
See `docs/technical/Agentic_Architecture_LangGraph.md` §5 for the full roadmap and §6 for the graph node design.

- 8-node `StateGraph`: parse_intent → gather_rosters → analyze_schedule → check_injuries → identify_candidates → validate_moves → compose_lineup → present_and_confirm.
- Human interrupt/resume at the confirmation gate.
- Streaming partial results to UI during execution.
- Full evaluation suite in `fanvise_eval/golden_dataset.json` (category: `agentic`).

## Acceptance Criteria (v1)

- Recommends only legal, slot-valid lineup moves.
- Uses next 2-3 day schedule by default when requested.
- Excludes clearly unavailable/inactive free agents.
- Returns ranked options with expected gain and rationale.
- Produces stable results for identical inputs.
