# API Services & AI Agents

The backend of FanVise is powered by a set of TypeScript services and an AI Orchestrator that coordinates between the user, the database, and the LLM.

## AI Orchestrator (`src/lib/agents/orchestrator.ts`)

The Orchestrator is the central "brain" of the application. It handles:
- **Model Selection**: Defaults to `gemini-1.5-flash-8b` (or `gemini-1.5-flash`) for low-latency responses.
- **Local AI Fallback**: Support for Ollama (`deepseek-r1:14b`) for local development or privacy-focused usage.
- **Retry Logic**: Implements exponential backoff for 429 (rate limit) errors.

## Chat API (`src/app/api/chat/route.ts`)

The primary interaction point. It performs a multi-stage context injection before calling the LLM:
1. **News Retrieval (RAG)**: Searches the `news_intelligence` table for relevant player updates.
2. **Perspective Injection**: Pulls the active team's manager info, league scoring rules, and roster settings.
3. **Matchup Context**: Fetches live matchup data (scores, opponents) from the ESPN API via the `EspnClient`.

## Core Services

- **ESPN Client (`src/lib/espn/client.ts`)**: A robust wrapper for the private ESPN API. Handles league settings, team rosters, and matchup schedules.
- **News Service (`src/lib/services/news-service.ts`)**: Scrapes and searches for basketball intelligence. Integrates with the Supabase vector store for retrieval.
- **Database Wrappers (`src/lib/db/*`)**: Type-safe functions for interacting with `leagues`, `teams`, and `news` tables.
