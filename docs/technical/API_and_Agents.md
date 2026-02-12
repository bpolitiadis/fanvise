# API Services & AI Agents

The intelligence of FanVise is powered by a centralized **AI Service** and a dedicated **Prompt Engine** that coordinates between the user, the database, and the Large Language Models.

## AI Service (`src/services/ai.service.ts`)

The central gateway for all model interactions. It provides a provider-agnostic interface for:
- **Streaming Responses**: Optimized for real-time chat interactions.
- **Provider Switching**: Seamlessly toggles between **Google Gemini** (Cloud) and **Ollama** (Local/DeepSeek) based on environment configuration.
- **Task Specialization**: Dedicated handlers for text embeddings (`nomic-embed` or `text-embedding-004`) and structured intelligence extraction.

## Prompt Engine (`prompts/index.ts`)

A sophisticated layer that builds high-fidelity, context-rich system instructions. 
- **The Consigliere Persona**: A specialized agent persona defined in `prompts/agents/consigliere.ts`. It enforces **Strict Truth Anchoring**, requiring the AI to only use provided news and roster data.
- **Context Injection**: Uses `Snapshot` objects from the `LeagueService` to build a complete view of league rules, team rosters, and active matchups before sending the query to the LLM.

## Chat API (`src/app/api/chat/route.ts`)

The primary streaming endpoint. It performs several orchestrated steps per request:
1. **RAG Retrieval**: Calls `NewsService` to perform a vector search for latest injury reports and intelligence.
2. **Perspective Loading**: Fetches the state of the user's league and team via `LeagueService`.
3. **Prompt Composition**: Passes the combined news, league data, and chat history through the `Prompt Engine`.
4. **Streaming Execution**: Executes the generative call via the `AI Service` and streams response chunks to the frontend.

## Key Services
- **League Service (`src/services/league.service.ts`)**: Aggregates ESPN API data and Supabase records into a unified "Intelligence Snapshot".
- **News Service (`src/services/news.service.ts`)**: Manages the RAG pipeline, including RSS ingestion, AI intelligence extraction, and vector storage.
- **ESPN Client (`src/lib/espn/client.ts`)**: The core connector for fetching team and league data.
