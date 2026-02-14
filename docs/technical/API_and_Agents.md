# API Services & AI Agents

The intelligence of FanVise is powered by a centralized **AI Service** and a dedicated **Prompt Engine** that coordinates between the user, the database, and the Large Language Models.

## AI Service (`src/services/ai.service.ts`)

The central gateway for all model interactions. It provides a provider-agnostic interface for:
- **Streaming Responses**: Optimized for real-time chat interactions.
- **Provider Switching**: Seamlessly toggles between **Google Gemini** (Cloud) and **Ollama** (Local/DeepSeek) based on environment configuration.
- **Task Specialization**: Dedicated handlers for text embeddings (`nomic-embed` or `gemini-embedding-001`) and structured intelligence extraction.

## Prompt Engine (`prompts/index.ts`)

A sophisticated layer that builds high-fidelity, context-rich system instructions. 
- **The Orchestrator Persona**: A specialized agent persona defined in `prompts/agents/orchestrator.ts`. It enforces **Strict Truth Anchoring**, requiring the AI to only use provided news and roster data while maintaining a competitive, informal tone.
- **Context Injection**: Uses `Snapshot` objects from the `LeagueService` to build a complete view of league rules, team rosters, and active matchups before sending the query to the LLM.

## Intelligence Service (`src/services/intelligence.service.ts`)

The **Central Brain** of the application. It orchestrates the entire "FanVise Strategist" workflow by:
1.  **RAG Retrieval**: Calling `NewsService` to fetch relevant news and injury reports.
2.  **Context Building**: Calling `LeagueService` to build a snapshot of the user's specific fantasy environment.
3.  **Daily Leaders Context**: Calling `DailyLeadersService` to inject per-period performance data ("who shined yesterday?", "my team yesterday") when the query matches daily-leader intents.
4.  **Prompt Engineering**: Using the `Prompt Engine` to synthesize data into a strict system instruction.
5.  **Generative Execution**: Delegating the final prompt to the `AI Service` for streaming generation.

## Chat API (`src/app/api/chat/route.ts`)

A thin controller layer that receives user input and delegates execution to the `Intelligence Service`.
-   **Responsibility**: Request validation, rate limiting, and response streaming.
-   **Perspective authorization**: League/team context is validated server-side via `authorizePerspectiveScope` (`src/utils/auth/perspective-authorization.ts`). Only authorized or allowed public fallback perspectives are passed to the Intelligence Service; see [Security Audit](./Security_Audit_Report_2026-02-13.md) for threat model and hardening.
-   **Stream robustness**: A heartbeat token is sent immediately so clients/proxies do not time out during slow context assembly or local model boot.
-   **Eval Observability (Dev Only)**: when `evalMode=true` and `NODE_ENV=development`, the route can return `debug_context` for black-box faithfulness evaluation.

## Key Services
- **Intelligence Service (`src/services/intelligence.service.ts`)**: Orchestrates RAG, context building, daily leaders context, and prompt generation.
- **League Service (`src/services/league.service.ts`)**: Aggregates ESPN API data and Supabase records into a unified "Intelligence Snapshot".
- **News Service (`src/services/news.service.ts`)**: Manages the RAG pipeline, including RSS ingestion, AI intelligence extraction, and vector storage.
- **Daily Leaders Service (`src/services/daily-leaders.service.ts`)**: Syncs and serves per-scoring-period player performance from ESPN; powers "who shined yesterday?" and "my team yesterday" chatbot context.
- **ESPN Client (`src/lib/espn/client.ts`)**: The core connector for fetching team, league, and daily leaders data.

## Evaluation Agent (Standalone)

`fanvise_eval/test_fanvise.py` acts as a standalone black-box evaluator against `/api/chat`:

- Sends controlled prompts from `fanvise_eval/golden_dataset.json`.
- Collects output and optional `debug_context`.
- Applies deterministic policy/math checks.
- Applies optional LLM-judge metrics (provider selected via `FANVISE_JUDGE_PROVIDER`).
