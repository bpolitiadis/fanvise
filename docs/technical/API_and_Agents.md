# API Services & AI Agents

FanVise currently supports a **dual-mode AI architecture**:
- **Classic mode** (`POST /api/chat`): single-pass RAG pipeline for fast, reliable strategy answers.
- **Agentic mode** (`POST /api/agent/chat`): LangGraph supervisor with tool-calling for deeper, iterative analysis.

## 1. Classic Mode (`POST /api/chat`)

Classic mode delegates to the `IntelligenceService` (`src/services/intelligence.service.ts`) and follows a deterministic orchestration path:
1. **RAG Retrieval**: `NewsService` fetches relevant news and injury reports.
2. **Context Building**: `LeagueService` builds a league/team snapshot.
3. **Daily Leaders Context**: `buildDailyLeadersContext` adds scoring-period context when relevant ("who shined yesterday?", "my team yesterday").
4. **Prompt Engineering**: `prompts/index.ts` constructs the grounded system prompt.
5. **Generative Execution**: `AIService` streams the answer back to the client.

## 2. Agentic Mode (`POST /api/agent/chat`)

Agentic mode uses the supervisor graph (`src/agents/supervisor/agent.ts`) to choose tools dynamically based on the user query.

This mode is best for deep-dive questions where the model must combine multiple lookups and reasoning steps before answering.

## Chat Route Behavior (Both Endpoints)

Both chat routes apply the same core safety and delivery patterns:
- **Perspective authorization** through `authorizePerspectiveScope` (`src/utils/auth/perspective-authorization.ts`) before building league/team context.
- **Stream heartbeat token** (`[[FV_STREAM_READY]]`) so clients/proxies receive immediate bytes during slow context assembly or local model startup.
- **Eval mode support** (`evalMode=true`) with structured debug output in development workflows.

## Core Foundation Services

- **AI Service (`src/services/ai.service.ts`)**: Provider-agnostic model gateway for streaming, embeddings, and environment-based routing (Gemini or Ollama).
- **Prompt Engine (`prompts/index.ts`)**: Builds strict, context-grounded General Manager instructions.
- **League Service (`src/services/league.service.ts`)**: Aggregates ESPN + Supabase data into an intelligence snapshot.
- **News Service (`src/services/news.service.ts`)**: Manages ingestion, intelligence extraction, and vector retrieval.
- **Daily Leaders Service (`src/services/daily-leaders.service.ts`)**: Provides per-period performance context for chat and sync flows.

## Evaluation Agent (Standalone)

`fanvise_eval/test_fanvise.py` runs black-box checks against `/api/chat`:
- Sends prompts from `fanvise_eval/golden_dataset.json`.
- Captures output and optional `debug_context`.
- Applies deterministic policy/math checks.
- Applies optional LLM-judge metrics via `FANVISE_JUDGE_PROVIDER`.
