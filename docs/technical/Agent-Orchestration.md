# The API & Agentic Orchestration

The FanVise AI engine operates through a singular Next.js API endpoint, relying wholly on **LangGraph** to govern branching logic, prompt construction, and tool selection.

## 📍 The Entry Point: `POST /api/agent/chat`

The `/api/agent/chat` endpoint handles all communication between the client interface and the LangGraph orchestrators. Instead of relying on traditional REST verbs and fragmented data endpoints, the UI streams its entire context payload here:

* **Payload Contains**: Conversational history (`messages`), active perspective (`activeTeamId`, `activeLeagueId`), language preferences, and an optional `evalMode` flag.
* **Perspective Authorization**: The route executes `authorizePerspectiveScope` prior to AI generation. This resolves and validates the user's team/league IDs against the database before injecting them into the prompt.

## 🛣️ LangGraph Supervisor Routing

Depending on the classified intent of the top-level user query, the Supervisor node dictates the execution graph:

1. **Lineup Optimizer Flow (`LineupOptimizerGraph`)**
   Activated when the intent involves setting a starting lineup for a specific day.
   * **Mechanism:** Routes away from conversational tool-calling. Instead, it relies on the `OptimizerService` to execute deterministic math on the roster and schedule, culminating in a single LLM synthesis step.
   * **Why:** Removing iterative LLM tool-calling drastically lowers latency for rigid mathematical tasks.

2. **General Manager Flow (`ReAct Agent Loop`)**
   Activated for player scouting, trade analysis, waivers, and broad advice.
   * **Mechanism:** Operates via a standard ReAct (Reason + Act) loop utilizing `bindTools`. The agent can invoke functions like `search_news`, `get_my_roster`, or `simulate_drop_add_move`.
   * **Why:** It allows the agent to recursively follow its chain of thought if the first piece of retrieved data reveals a new avenue of investigation (e.g., seeing a player is injured and subsequently querying the waiver wire for backups).

## 📡 The Stream Protocol

Standard Server-Sent Events (SSE) aren't rich enough for hybrid AI architectures that need to return conversational text *and* executable JSON actions intermixed.

FanVise utilizes a **Stream Protocol**:
* **Connection Handshake:** At the start of the stream, an initial `"[[FV_STREAM_READY]]"` heartbeat token is emitted so the UI knows the API is responsive.
* **Base64 Payload Markers:** If the LLM generates a structured move (e.g., adding a player), it encodes the JSON payload block. The client intercepts these markers, parses the Base64 out of the text stream, and renders an interactive UI widget inline—all while the LLM continues generating English explanations natively.

## 🚀 Room for Improvement / Next Steps
* **Enhanced Tool Calling Reliability:** Currently, if a LangGraph tool throws a raw exception, the ReAct loop can occasionally crash or stall. Implementing robust LLM fallback strategies via `ToolNode` wrappers can help the agent gracefully recover from broken API responses instead of aborting the stream.
* **LLM-Judge Metrics:** Utilizing `fanvise_eval/` directly during staging build deployments to automatically grade the ReAct loop's tool utilization efficiency (measuring "Tool Call Count" against optimal baselines) to prevent the agent from getting stuck in endless search loops.
