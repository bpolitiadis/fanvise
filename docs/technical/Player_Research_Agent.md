# Player Research Agent

**Status:** Implemented — Feb 23, 2026  
**Step:** 1 of the Agentic Architecture Roadmap  
**See also:** `docs/technical/Agentic_Architecture_LangGraph.md`

---

## What It Does

The Player Research Agent is FanVise's first LangGraph agent. It answers questions about individual NBA players by:

1. Fetching **live ESPN injury/status data** via `getPlayerCard()` (not from pre-synced snapshots)
2. Searching the **FanVise news vector store** for recent articles about the player
3. Synthesizing both sources into a **structured recommendation**: ACTIVE / MONITOR / HOLD / STREAM / DROP

This replaces the previous approach of relying solely on pre-synced `player_status_snapshots` — the agent always fetches fresh data when queried.

---

## API

### Endpoint

```
POST /api/agent/player
```

### Request Body

```json
{
  "query": "What is Ja Morant's current injury status?",
  "playerName": "Ja Morant"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Natural language question about the player |
| `playerName` | string | No | Resolved player name if already known |

### Response

```json
{
  "playerName": "Ja Morant",
  "status": "GTD",
  "injuryType": "right knee soreness",
  "expectedReturnDate": null,
  "recommendation": "MONITOR",
  "confidence": "HIGH",
  "summary": "Ja Morant is listed as GTD with right knee soreness per ESPN (2026-02-22). Two beat reporters have confirmed he is expected to play. Monitor official pregame reports.",
  "sources": ["ESPN_PLAYERCARD", "Rotowire", "ESPN"],
  "fetchedAt": "2026-02-23T10:30:00.000Z"
}
```

### Recommendation Values

| Value | Meaning |
|---|---|
| `ACTIVE` | Healthy, no concerns, start with confidence |
| `MONITOR` | Minor issue (GTD/DTD), expected to play — watch pregame reports |
| `HOLD` | Injured but returning within ~7 days — do not drop |
| `STREAM` | Spot can be temporarily filled — player unlikely to play soon |
| `DROP` | Long-term or season-ending injury confirmed by multiple sources |

### Confidence Values

| Value | Meaning |
|---|---|
| `HIGH` | ESPN + news agree, data is < 24h old |
| `MEDIUM` | Sources partially agree or data is 24–72h old |
| `LOW` | Conflicting sources, stale data, or player not found |

---

## Architecture

```
POST /api/agent/player
        │
        ▼
runPlayerResearch()
        │
        ▼
┌─────────────────────────────┐
│  LangGraph StateGraph        │
│                              │
│  __start__ → agent node     │  Gemini 2.0 Flash with tools bound
│       ↓ (tool call?)         │
│  tools node                  │  ToolNode executes:
│       ↓                      │  - get_espn_player_status
│  extract_results node        │  - get_player_news
│       ↓                      │
│  agent node (again)          │  LLM synthesizes results
│       ↓ (no more tools)      │
│  build_report node           │  Parses LLM output → typed report
│       ↓                      │
│     END                      │
└─────────────────────────────┘
```

### State Shape

```typescript
interface PlayerResearchState {
  messages: BaseMessage[];       // Conversation thread (LLM + tool messages)
  playerName: string;            // Resolved player name
  originalQuery: string;         // Raw user question
  espnStatus: PlayerStatusResult | null;   // From get_espn_player_status tool
  newsItems: NewsItem[];         // From get_player_news tool
  report: PlayerResearchReport | null;     // Final output
  iterationCount: number;        // Iteration guard (max 4)
  error: string | null;
}
```

### Tool Definitions

#### `get_espn_player_status`
- Looks up player ID from `player_status_snapshots` DB
- Calls `EspnClient.getPlayerCard()` for live injury metadata
- Falls back to DB snapshot if ESPN call fails
- Returns: `PlayerStatusResult` (status, injuryType, expectedReturnDate, source, fetchedAt)

#### `get_player_news`
- Calls `searchNews()` with a targeted player query
- Returns up to 8 recent news items with trust level and injury status metadata

---

## Tool Calling Flow

The LLM will typically call tools in this sequence:

```
1. get_espn_player_status("Ja Morant")
   → returns: { status: "GTD", injuryType: "knee soreness", ... }

2. get_player_news("Ja Morant")
   → returns: [ { title: "Morant questionable for tonight...", trustLevel: 5, ... }, ... ]

3. [No more tool calls — synthesize into report]
```

The `shouldContinue` edge checks if the last LLM message contains tool calls. If yes → route to `tools` node. If no → route to `build_report`.

---

## Guardrails

- **Max iterations: 4** — prevents runaway tool calls
- **Unknown players**: returns `status: "UNKNOWN"`, `source: "NOT_FOUND"` — never fabricates
- **Conflicting sources**: LLM is instructed to prefer newer timestamp and note the discrepancy
- **Star injury rumors**: system prompt enforces "do not drop" language
- **Stale data**: `confidence: LOW` when data is old or sources conflict

---

## Source Files

```
src/agents/player-research/
  agent.ts       ← StateGraph definition, runPlayerResearch() entry point
  tools.ts       ← get_espn_player_status, get_player_news tool wrappers
  state.ts       ← TypeScript types + LangGraph Annotation
  prompts.ts     ← Agent system prompt

src/app/api/agent/player/
  route.ts       ← POST /api/agent/player REST endpoint
```

---

## Evaluation Scenarios

All cases live in `fanvise_eval/golden_dataset.json` under `"category": "agentic"`:

| ID | Scenario | Risk |
|---|---|---|
| `agentic_player_research_01` | GTD player — hold or stream? | high |
| `agentic_player_research_02` | Healthy player — confirm and start | high |
| `agentic_player_research_03` | Mid-tier GTD player, 2 games remaining | high |
| `agentic_player_research_conflicting_sources` | ESPN vs social media conflict | critical |
| `agentic_player_research_unknown_player` | Non-existent player — must not hallucinate | critical |

---

## Next Steps

This agent is Step 1 of the roadmap. Once validated:

- **Step 2**: Integrate this agent into the main chat flow so the LLM can call `get_player_status` and `get_player_news` mid-conversation instead of relying on pre-synced data
- **Step 3**: Build the `MatchupOptimizerGraph` using this agent's tools as building blocks
