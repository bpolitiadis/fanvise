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

### Do we need LangChain now?

No. This flow does not require LangChain for v1.

Recommended v1 architecture:
- Next.js API route as controller.
- Tool/function-calling for data fetches.
- Deterministic optimizer module for scoring/simulation.
- LLM for orchestration, narration, and clarification.

When LangGraph (or LangChain) becomes useful:
- Multi-step workflows with branching/retries/human checkpoints.
- Durable agent state across long sessions.
- Complex multi-agent coordination.
- Standardized tracing/evaluation needs at higher scale.

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

### Phase 5: Optional LangGraph Upgrade

Adopt only after workflow complexity justifies it:
- Transaction-aware multi-step plans.
- Long-lived agent memory/state.
- Advanced branching and recovery policies.

## Acceptance Criteria (v1)

- Recommends only legal, slot-valid lineup moves.
- Uses next 2-3 day schedule by default when requested.
- Excludes clearly unavailable/inactive free agents.
- Returns ranked options with expected gain and rationale.
- Produces stable results for identical inputs.
