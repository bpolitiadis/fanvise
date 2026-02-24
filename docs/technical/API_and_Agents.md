# API Services & AI Agents

The intelligence of FanVise is powered by a **Dual-Mode AI Architecture**. Users can seamlessly toggle between a lightning-fast "Classic" RAG pipeline and a deliberate, autonomous "Agentic" reasoning mode.

## 1. Classic Mode (Single-Pass RAG)
**Endpoint**: `POST /api/chat`

Classic mode is the default. It leverages the `IntelligenceService` (`src/services/intelligence.service.ts`) to execute a highly optimized, single-pass pipeline:
1. **Context Building**: The `LeagueService` builds a snapshot of the user's specific fantasy environment (rosters, matchups).
2. **RAG Retrieval**: The `NewsService` fetches the latest relevant news and injury reports from Supabase `pgvector`.
3. **Prompt Injection**: The `Prompt Engine` (`src/prompts/index.ts`) formats all this data into the strict "FanVise Strategist" system prompt.
4. **Streaming Execution**: The payload is sent to the Large Language Model via `AIService` and streamed back to the client immediately.

*Use Case*: "Who should I start tonight?" or "Summarize today's news."

## 2. Agentic Mode (LangGraph)
**Endpoint**: `POST /api/agent/chat`

Agentic mode uses LangGraph (`src/agents/supervisor/agent.ts`) to orchestrate autonomous agents. Instead of a single pass, the AI acts as a **Supervisor**, dynamically deciding which tools and sub-agents to invoke.

The Supervisor has access to specialized tools (registered in `src/agents/shared/tool-registry.ts`), such as:
- **Player Research Agent**: Can actively scrape live web sources or execute multiple database queries iteratively to build a comprehensive profile on a player before answering.

*Use Case*: "Do a deep dive on Tyrese Maxey's injury and tell me if I should drop him." The agent will actively search for live updates before synthesizing a strategy.

## Core Foundation Services

Regardless of the mode, the AI relies on these foundational services:

- **AI Service (`src/services/ai.service.ts`)**: The gateway for model interactions. Handles streaming responses and safely toggles between **Google Gemini** (Cloud) and **Ollama** (Local).
- **Prompt Engine (`src/prompts/index.ts`)**: Defines the "FanVise Strategist" persona. It heavily enforces **Strict Truth Anchoring**, requiring the AI to only use provided news and roster data without hallucinating stats.
- **League Service (`src/services/league.service.ts`)**: Aggregates ESPN API data and Supabase records into the unified "Intelligence Snapshot".

## Local Environment Note

Agentic mode relies heavily on **Tool Calling** (Function Calling). 
If you are developing locally with Ollama, you **must** use a model that supports robust tool calling (e.g., `llama3.1`). Standard models or reasoning models like `deepseek-r1` will fail significantly when trying to act as a LangGraph node. If Agentic mode behaves erratically, fallback to Gemini (`USE_LOCAL_AI=false`).
