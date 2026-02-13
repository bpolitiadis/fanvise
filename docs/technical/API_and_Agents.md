# API Services & AI Agents

The intelligence of FanVise is powered by a centralized **AI Service** and a dedicated **Prompt Engine** that coordinates between the user, the database, and the Large Language Models.

## AI Service (`src/services/ai.service.ts`)

The central gateway for all model interactions. It provides a provider-agnostic interface for:
- **Streaming Responses**: Optimized for real-time chat interactions.
- **Provider Switching**: Seamlessly toggles between **Google Gemini** (Cloud) and **Ollama** (Local/DeepSeek) based on environment configuration.
- **Task Specialization**: Dedicated handlers for text embeddings (`nomic-embed` or `text-embedding-004`) and structured intelligence extraction.

## Prompt Engine (`prompts/index.ts`)

A sophisticated layer that builds high-fidelity, context-rich system instructions. 
- **The Orchestrator Persona**: A specialized agent persona defined in `prompts/agents/orchestrator.ts`. It enforces **Strict Truth Anchoring**, requiring the AI to only use provided news and roster data while maintaining a competitive, informal tone.
- **Context Injection**: Uses `Snapshot` objects from the `LeagueService` to build a complete view of league rules, team rosters, and active matchups before sending the query to the LLM.

## Intelligence Service (`src/services/intelligence.service.ts`)

The **Central Brain** of the application. It orchestrates the entire "FanVise Strategist" workflow by:
1.  **RAG Retrieval**: Calling `NewsService` to fetch relevant news and injury reports.
2.  **Context Building**: Calling `LeagueService` to build a snapshot of the user's specific fantasy environment.
3.  **Prompt Engineering**: Using the `Prompt Engine` to synthesize data into a strict system instruction.
4.  **Generative Execution**: Delegating the final prompt to the `AI Service` for streaming generation.

## Chat API (`src/app/api/chat/route.ts`)

A thin controller layer that receives user input and delegates execution to the `Intelligence Service`.
-   **Responsibility**: Request validation, rate limiting, and response streaming.
-   **Logic**: **None**. All business logic is now encapsulated in the Intelligence Service.

## Key Services
- **Intelligence Service (`src/services/intelligence.service.ts`)**: Orchestrates RAG, context building, and prompt generation.
- **League Service (`src/services/league.service.ts`)**: Aggregates ESPN API data and Supabase records into a unified "Intelligence Snapshot".
- **News Service (`src/services/news.service.ts`)**: Manages the RAG pipeline, including RSS ingestion, AI intelligence extraction, and vector storage.
- **ESPN Client (`src/lib/espn/client.ts`)**: The core connector for fetching team and league data.
