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

### Phase 1: Deterministic Optimizer Core

- Implement baseline lineup simulation for date window.
- Implement candidate generation rules (drop/add).
- Implement move simulation and point-delta ranking.
- Add unit tests for slot legality and gain calculations.

### Phase 2: Chat Integration (No LangChain)

- Add optimization intent route in `IntelligenceService`.
- Wire tool calls for roster, schedule, free agents, health.
- Produce structured response payload for UI rendering.
- Keep chat text generation separate from optimizer math.

### Phase 3: Product UX and Safety

- Add recommendation cards ("Drop X, Add Y, +Z pts").
- Show confidence and freshness indicators.
- Require explicit user confirmation before transaction actions.

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
