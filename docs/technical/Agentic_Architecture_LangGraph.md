# Agentic Architecture: LangGraph Integration

**Status:** Adopted — Feb 23, 2026  
**Supersedes:** `Lineup_Optimization_Flow.md` §"Do we need LangChain now?" (answer updated to: **Yes, LangGraph — starting now**)  
**Owner:** VP Digital Solutions

---

## 1. Why This Decision Was Made

FanVise's original architecture is a **single-pass RAG**: gather all context upfront in parallel, inject it into one system prompt, get one LLM response. That design is correct for simple Q&A — "what's the latest on Jokic?", "who's injured on my team?".

It breaks down for the class of problems we are now targeting:

> "Review my matchup and help me optimize. Don't destroy my team."

A human manager doing this manually would:
1. Check their roster, then the opponent's roster.
2. Pull the remaining NBA schedule for every relevant player this week.
3. Identify weak players — especially those with few games left.
4. Scan free agents: healthy, games in window, position match.
5. For each candidate (drop X, add Y): validate that Y actually starts on the days needed.
6. Re-check all injuries — especially DTD/Out/Suspended players — for comeback timelines.
7. Compose optimal daily lineups for the rest of the week.

This is a **stateful, multi-step, conditional workflow with loops and validation gates**. A single prompt cannot faithfully simulate it. The LLM would skip steps, miss edge cases, and hallucinate slot-fit validity.

### The specific trigger criteria from our own docs

Our `Lineup_Optimization_Flow.md` already documented exactly when LangGraph becomes necessary:

> - Multi-step workflows with branching/retries/human checkpoints ✓  
> - Durable agent state across long sessions ✓  
> - Complex multi-agent coordination ✓  
> - Standardized tracing/evaluation needs ✓

The matchup optimization scenario hits all four. The decision to defer was reasonable for v0. It is not reasonable for v1.

---

## 2. LangGraph, Not Classic LangChain

**Critical distinction:**

| | LangChain (chains) | LangGraph |
|---|---|---|
| Paradigm | Linear pipeline | Directed graph with state |
| Routing | Fixed | Conditional edges |
| Loops | No native support | First-class citizen |
| Human-in-the-loop | Bolted on | Built-in checkpointing |
| State | Ephemeral | Typed, persistent, checkpointed |
| Tracing | LangSmith optional | LangSmith native |
| Use case | Simple agent, quick prototype | Production multi-step workflows |

We adopt **LangGraph** (`@langchain/langgraph`) specifically. We do **not** adopt legacy LangChain chain abstractions (`LLMChain`, `ConversationalRetrievalChain`, etc.) — they fight with our existing service layer.

Our existing code is preserved and called as **tools** from within the graph:
- `EspnClient` → ESPN API tools
- `searchNews()` → RAG news tool
- `buildIntelligenceSnapshot()` → league snapshot tool
- `searchPlayerStatusSnapshots()` → player status tool

---

## 3. Architectural Layers After Adoption

```
┌─────────────────────────────────────────────────────┐
│                    Next.js App Router                │
│  /api/chat         /api/agent/matchup-optimizer      │
└────────────┬───────────────────────────┬────────────┘
             │                           │
             ▼                           ▼
┌────────────────────┐     ┌─────────────────────────────┐
│  Intelligence Svc  │     │   LangGraph Agent Runtime    │
│  (existing, v0)    │     │   (new, incremental)         │
│                    │     │                              │
│  - Single-pass RAG │     │  - StateGraph                │
│  - Parallel fetch  │     │  - Tool-calling loop (ReAct) │
│  - One LLM call    │     │  - Conditional edges         │
│                    │     │  - Human-in-the-loop gates   │
└────────────────────┘     └──────────────┬──────────────┘
                                          │
                    ┌─────────────────────┼──────────────────────┐
                    │                     │                       │
                    ▼                     ▼                       ▼
          ┌──────────────┐    ┌────────────────────┐   ┌──────────────────┐
          │ ESPN Tools   │    │  RAG / News Tools   │   │ Optimizer Module  │
          │              │    │                     │   │ (deterministic)   │
          │ getPlayerCard│    │ searchNews()        │   │                   │
          │ getFreeAgents│    │ getPlayerStatus()   │   │ simulateMoves()   │
          │ getMatchup() │    │ getEmbedding()      │   │ rankCandidates()  │
          └──────────────┘    └────────────────────┘   └──────────────────┘
```

**Key principle:** The two entry points coexist. Simple questions hit the existing Intelligence Service. Complex workflows hit the LangGraph runtime. We converge gradually.

---

## 4. Core User Scenarios Driving This Architecture

These scenarios are the acceptance criteria for the agentic layer. Each is also tracked as an evaluation test case in `fanvise_eval/golden_dataset.json`.

### Scenario A: Full Matchup Review & Optimization
**User prompt:** *"Review my matchup and help me optimize for this week without destroying my team."*

Agent workflow:
1. `get_roster(myTeamId)` + `get_roster(opponentTeamId)`
2. `get_schedule(allPlayerIds, weekWindow)` → count games per player
3. `get_player_status(each player)` → live injury/status check
4. Identify drop candidates: low avg + few games remaining + replaceable
5. `get_free_agents(position, healthyOnly, gamesInWindow)` → add candidates
6. For each (drop, add) pair: `validate_slot_fit(add_player, days_remaining)` → is gain positive?
7. `get_player_news(flaggedPlayers)` → re-verify DTD/Out players' timelines
8. `compose_weekly_lineup(finalRoster, schedule)` → optimal starts per day
9. Present ranked recommendations + weekly lineup + confidence indicators
10. **Human gate:** require user approval before any transaction

### Scenario B: Mid-Week Streaming Decision
**User prompt:** *"Who should I stream for the rest of this week? I'm down in assists and steals."*

Agent workflow:
1. `get_matchup_status()` → category deltas, days remaining
2. `get_schedule(myRoster, remainingDays)` → who's playing when
3. `get_free_agents(target_categories=["AST","STL"])` → filtered candidates
4. For each candidate: `validate_slot_fit()` + `check_injury_status()`
5. Rank by category contribution × games remaining × reliability

### Scenario C: Injury Re-Evaluation Loop
**User prompt:** *"My guard is listed DTD. Should I hold or stream his spot?"*

Agent workflow:
1. `get_player_status(player)` → current ESPN injury status
2. `get_player_news(player)` → latest news (practice reports, beat reporter updates)
3. Decision branch:
   - If return is tonight/tomorrow → **hold**
   - If return is 3+ days away → evaluate streaming cost vs return value
4. `get_free_agents(position=SG)` → stream candidates if applicable
5. `validate_slot_fit()` for each candidate
6. Provide hold/drop recommendation with reasoning and timeline

### Scenario D: End-of-Week Lineup Composition
**User prompt:** *"I have 11 players active on Thursday. Who sits?"*

Agent workflow:
1. `get_roster_for_day(date)` → who's scheduled to play
2. `get_player_status(all)` → confirm no late scratches
3. `run_lineup_optimizer(players, slots, scoring_settings)` → deterministic slot assignment
4. Identify bench candidates: position redundancy, lower floor
5. Return optimal lineup card for the day

---

## 5. Implementation Roadmap

### Step 2: Supervisor Agent & Shared Tool Registry — Feb 2026 ✅ COMPLETE

**Goal:** The LLM decides which tools to call. No hardcoded routing per question type.

Architecture — ReAct loop with intent classification:
```
__start__ → classify_intent → agent → [tools → agent]* → synthesize → END
```

Deliverables (all implemented):
- `src/agents/shared/tool-registry.ts` — canonical tool definitions used by all agents
- `src/agents/shared/types.ts` — shared state types (`QueryIntent`, `FreeAgentCandidate`, etc.)
- `src/agents/supervisor/agent.ts` — Supervisor `StateGraph` with `runSupervisor()` + `streamSupervisor()`
- `src/agents/supervisor/state.ts` — typed `SupervisorAnnotation` state
- `src/agents/supervisor/prompts.ts` — `SUPERVISOR_SYSTEM_PROMPT` + intent classifier prompt
- `src/app/api/agent/chat/route.ts` — `POST /api/agent/chat` (drop-in for `/api/chat`)
- `POST /api/agent/player` still works as before (Step 1)
- 9 new evaluation scenarios in `golden_dataset.json` (category: `supervisor`)

**How the Supervisor works:**
1. `classify_intent` node: cheap single LLM call to label the query (`player_research`, `free_agent_scan`, `matchup_analysis`, `lineup_optimization`, `general_advice`)
2. `agent` node: Gemini + all tools bound; the LLM reasons about which tools to call
3. `tools` node: `ToolNode` executes whatever tools the LLM selected
4. Loop: after each tool call, the LLM re-evaluates — more tools needed? Or synthesize?
5. `synthesize` node: formats the final answer; appends safety boilerplate if needed
6. Max 8 tool calls per turn as a loop guard

**Tool routing examples:**
- "What's Ja Morant's status?" → `get_espn_player_status` + `get_player_news` (2 calls)
- "Best free agents right now?" → `get_free_agents` + `search_news_by_topic` (2 calls)
- "Optimize my matchup" → `get_my_roster` + `get_matchup_details` + 3-5× `get_espn_player_status` + `get_free_agents` (6-8 calls)
- "Should I drop Jokic?" → `get_espn_player_status("Nikola Jokic")` + `get_player_news("Nikola Jokic")` (2 calls, then "do not drop")
- "How has Haliburton been playing?" → `get_player_game_log("Tyrese Haliburton", 10)` (1 call, returns box scores + averages)
- "Should I start Booker?" → `get_espn_player_status` + `get_player_game_log` (2 calls — health + form)

### Step 2.5: Player Game Log Tool — Feb 23, 2026 ✅ COMPLETE

**Goal:** Add concrete per-game data to the agent's toolkit, enabling evidence-based start/sit decisions and form analysis.

**Problem solved:** All previous tools provide *status* (injured? available?) and *narrative* (news text). The `get_player_game_log` tool provides *numbers* — actual box scores from the last N scoring periods — allowing the agent to say "averaging 32.4 FP over his last 10 games, with 3PM up to 3.2/g" instead of relying on stale news summaries.

**Architecture — Cache-on-Read:**
```
Agent calls get_player_game_log(playerName, lastNGames=10)
       ↓
game-log.service.ts
  ├── Resolve player_id via player_status_snapshots (ilike match)
  ├── Check player_game_logs cache (DB)
  │     ├── Sufficient + current period fresh? → return DB rows
  │     └── Miss / stale current period? → fetch ESPN kona_playercard
  │           ↓
  │           Filter stats[]: statSourceId=0 (actual) + statSplitTypeId=1 (per-period)
  │           Upsert into player_game_logs
  └── Return structured GameLogEntry[] + window averages
```

**ESPN data source:** `kona_playercard` view — same endpoint used for injury data. The `player.stats[]` array contains per-period entries. Past periods are immutable (cached forever); current period TTL = 15 min.

**Database table:** `public.player_game_logs` — see `Database.md` and migration `20260223000000_player_game_logs.sql`.

Deliverables:
- `supabase/migrations/20260223000000_player_game_logs.sql` — table, indexes, RLS
- `src/services/game-log.service.ts` — cache-on-read service with `getPlayerGameLog()`
- `src/lib/espn/client.ts` — added `getPlayerGameLog(playerIds, lastNPeriods)` method
- `src/agents/shared/tool-registry.ts` — `getPlayerGameLogTool` added to `ALL_TOOLS` (now 7 tools)
- `src/agents/supervisor/prompts.ts` — Supervisor system prompt updated with tool description
- `src/types/supabase.ts` — `player_game_logs` table typed
- 5 new evaluation scenarios (`game_log` category) in `golden_dataset.json`

### Step 1: Install & First Agent (Complete) — Feb 2026
**Goal:** Learn the pattern. Build infrastructure. Prove the tool-calling loop.

Deliverables:
- Install `@langchain/langgraph`, `@langchain/google-genai`, `@langchain/core`
- Create `src/agents/` directory structure
- Build `PlayerResearchAgent`: given a player name, call ESPN + search news, return structured report
- New API route: `GET /api/agent/player?name=<player>`
- Evaluation: add `player_research_*` test cases to golden dataset
- Documentation: `docs/technical/Player_Research_Agent.md`

### Step 3 (was Step 2): Wire Frontend to Supervisor — Mar 2026
**Goal:** The existing `generateStrategicResponse()` becomes an agent that decides what to fetch.

Deliverables:
- Define tool registry: `get_player_status`, `get_player_news`, `get_my_roster`, `get_free_agents`, `get_matchup_details`
- Replace fixed parallel pre-fetch with agent tool-calling loop
- Cap: max 6 tool calls per question to control cost/latency
- Simple questions (1-2 tools) answer faster than before; complex ones are more accurate
- Cache-on-read: tools check `player_status_snapshots` TTL before hitting ESPN

### Step 4: Matchup Optimizer Graph — Apr 2026
**Goal:** The flagship multi-step workflow from Scenario A.

Deliverables:
- `MatchupOptimizerGraph`: 8-node StateGraph (see §6 below)
- Deterministic `OptimizerService`: slot simulation, point-delta ranking (no LLM for math)
- Streaming progress updates to UI ("Analyzing your roster... Found 3 drop candidates...")
- Human confirmation gate before presenting final recommendations
- Evaluation: `matchup_optimization_*` test cases

### Step 5: Human-in-the-Loop & Weekly Planner — May 2026
**Goal:** Full week management in one conversation.

Deliverables:
- Interrupt/resume checkpointing via LangGraph `MemorySaver`
- UI: recommendation cards ("Drop X → Add Y, +8.4 pts expected") with Approve/Decline
- Conversation persists across page refreshes (durable state)
- Weekly lineup composer: day-by-day optimal starters

### Step 5: Observability & LangSmith — Ongoing
**Goal:** Production-grade tracing and evaluation.

Deliverables:
- LangSmith integration for all agent traces
- Per-run tool call visibility, latency, token counts
- Automated regression runs against golden dataset on every deploy

---

## 6. Supervisor Agent Architecture (Implemented)

The Supervisor is the main entry point for all agentic queries. It is a single `StateGraph` that uses a ReAct (Reason + Act) loop.

### Graph Structure

```
__start__
    │
    ▼
classify_intent          ← cheap single LLM call, no tools
    │                      labels query as: player_research | free_agent_scan |
    │                      matchup_analysis | lineup_optimization | general_advice
    ▼
  agent  ◄──────────────┐
    │                   │  After each tool call, loop back
    │ tool_calls?        │  to agent for re-evaluation
    ├──── YES ──► tools ─┘
    │
    │ no tool_calls (or max hit)
    ▼
synthesize
    │
   END
```

### State

```typescript
SupervisorAnnotation {
  messages: BaseMessage[]       // Full conversation thread
  teamId: string | null         // Injected from perspective context
  leagueId: string | null
  intent: QueryIntent | null    // Set by classify_intent node
  answer: string | null         // Final output
  toolCallCount: number         // Loop guard — max 8
  error: string | null          // Non-fatal errors surfaced in answer
}
```

### Available Tools (full registry)

| Tool | When the LLM uses it |
|---|---|
| `get_espn_player_status` | Any player health/availability question |
| `get_player_news` | Context behind a non-ACTIVE player status |
| `get_my_roster` | User asks about their team, lineup, who to drop |
| `get_free_agents` | Streamers, waiver pickups, add candidates |
| `get_matchup_details` | Current score, schedule volume, winning/losing |
| `search_news_by_topic` | Broad research: trends, hottest adds, injury waves |

### API Endpoints

| Route | Purpose |
|---|---|
| `POST /api/agent/chat` | Supervisor agent — streaming, drop-in for `/api/chat` |
| `POST /api/agent/player` | Player Research agent — single player deep-dive |

Both accept the same request shape as `/api/chat` so the frontend can switch transparently.

---

## 7. Matchup Optimizer Graph (Detailed — Next Implementation)

```
                    ┌──────────────────────┐
                    │  parse_intent        │  Detect optimization window
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  gather_rosters      │  My team + opponent
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  analyze_schedule    │  Games per player, week window
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  check_injuries      │  Live status per player (loop)
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  identify_candidates │  Drop candidates + add candidates
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  validate_moves      │  Slot-fit sim per (drop, add) pair
                    │                      │  Re-loop if no valid move found
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  compose_lineup      │  Daily optimal starters
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  present_and_confirm │  Human gate (interrupt)
                    └──────────────────────┘
```

**State shape:**
```typescript
interface MatchupOptimizerState {
  messages: BaseMessage[];
  myRoster: Player[];
  opponentRoster: Player[];
  weekWindow: { start: Date; end: Date };
  scheduleMatrix: Record<string, Date[]>;   // playerId → game dates
  injuryStatuses: Record<string, PlayerStatus>;
  dropCandidates: DropCandidate[];
  addCandidates: AddCandidate[];
  validMoves: Move[];
  weeklyLineup: DailyLineup[];
  awaitingConfirmation: boolean;
  iterationCount: number;                   // guard against infinite loops
}
```

---

## 8. Tool Definitions (Canonical List)

All tools are thin wrappers around existing services. The LLM decides which to call; the tools do the actual work.

| Tool Name | Service Used | Caching |
|---|---|---|
| `get_my_roster` | `league.service.buildIntelligenceSnapshot()` | 45s |
| `get_opponent_roster` | `EspnClient.getMatchups()` | 45s |
| `get_player_status` | `EspnClient.getPlayerCard()` + DB snapshot | 15 min TTL |
| `get_player_news` | `news.service.searchNews()` | None (vector search) |
| `get_free_agents` | `player.service.getTopFreeAgents()` | 5 min |
| `get_schedule` | `schedule.service` | 1 hr |
| `get_matchup_details` | `EspnClient.getMatchups()` | 45s |
| `validate_slot_fit` | `OptimizerService.simulateMoves()` | None (deterministic) |
| `compose_daily_lineup` | `OptimizerService.composeLineup()` | None (deterministic) |

---

## 9. Cost & Latency Model

| Query Type | Tool Calls | Est. Latency | Est. Cost |
|---|---|---|---|
| Simple player Q&A | 1-2 | 2-4s | ~$0.001 |
| Injury re-evaluation | 2-3 | 3-6s | ~$0.002 |
| Mid-week stream advice | 3-5 | 5-10s | ~$0.003 |
| Full matchup optimization | 6-10 | 10-20s | ~$0.008 |

Mitigations:
- Parallel tool calls where there are no data dependencies
- 15-min TTL cache on player status (avoids re-fetching ESPN per question)
- Max iteration guards on all loops
- Streaming partial results to UI during long workflows

---

## 10. What We Do NOT Adopt

| Rejected | Reason |
|---|---|
| `LLMChain`, `ConversationalRetrievalChain` | Legacy abstractions; fight with our service layer |
| LangChain `VectorstoreRetriever` | We already have pgvector + Supabase working well |
| LangChain `Memory` classes | LangGraph state handles this better |
| Full LangChain agent executor | LangGraph `StateGraph` is more explicit and testable |
| Auto-executed roster transactions | User approval required; never autonomous |

---

## 11. Evaluation Scenarios

All scenarios below are tracked in `fanvise_eval/golden_dataset.json` with category `agentic`.

See also: `docs/technical/Player_Research_Agent.md` for Step 1 specific cases.

| ID | Scenario | Risk Level |
|---|---|---|
| `agentic_player_research_01` | Research a single player status + news | high |
| `agentic_player_research_02` | Research player with conflicting news sources | high |
| `agentic_matchup_optimize_01` | Full matchup optimization, valid move exists | critical |
| `agentic_matchup_optimize_02` | No valid stream exists — agent must say so | high |
| `agentic_streaming_validate_01` | Stream candidate has no games remaining | high |
| `agentic_injury_reeval_01` | DTD player — hold vs stream decision | high |
| `agentic_lineup_compose_01` | 11 players active one day — who sits? | medium |
| `agentic_loop_guard_01` | Agent finds no valid move after 3 iterations — graceful exit | medium |

---

## 12. File Structure After Step 2

```
src/
  agents/
    player-research/
      agent.ts          ← Player Research StateGraph
      tools.ts          ← (now delegates to shared/tool-registry)
      state.ts          ← PlayerResearchAnnotation
      prompts.ts        ← Player research system prompt
    supervisor/
      agent.ts          ← Supervisor StateGraph + runSupervisor() + streamSupervisor()
      state.ts          ← SupervisorAnnotation
      prompts.ts        ← SUPERVISOR_SYSTEM_PROMPT + INTENT_CLASSIFIER_PROMPT
    shared/
      tool-registry.ts  ← ALL_TOOLS — canonical tool definitions (7 tools)
      types.ts          ← QueryIntent, FreeAgentCandidate, MatchupSummary, etc.

  app/api/agent/
    chat/route.ts       ← POST /api/agent/chat (Supervisor streaming endpoint)
    player/route.ts     ← POST /api/agent/player (Player Research endpoint)

docs/technical/
  Agentic_Architecture_LangGraph.md  ← This file
  Player_Research_Agent.md           ← Step 1 detailed spec
  Lineup_Optimization_Flow.md        ← Updated to reference LangGraph
```
