# System Architecture

FanVise is an AI-native fantasy sports intelligence platform designed as a "General Manager" layer on top of existing fantasy ecosystem. The application is built as a unified, standalone Next.js solution that integrates data ingestion, AI orchestration, and RAG pipelines into a single high-performance deployment.

## High-Level Overview

The system acts as a strategic co-manager (General Manager) for ESPN Fantasy Basketball. It aggregates structured data (league rosters, scoring) and unstructured intelligence (news, injury reports) to provide contextually grounded strategic advice. It employs an **Agentic Architecture** powered by a LangGraph Supervisor, supporting both high-performance cloud inference (Gemini) and privacy-focused local models (Ollama).

```mermaid
graph TD
    User((User)) -->|Interact| WebUI[Next.js App Router]
    
    subgraph "Next.js Application (Vercel/Node.js)"
        WebUI --> API_Agent[/api/agent/chat]
        API_Agent --> Supervisor[LangGraph Supervisor - Router]
        
        Supervisor -->|lineup_optimization| LineupOptimizer[LineupOptimizerGraph<br/>6 nodes, 1 LLM call]
        Supervisor -->|other intents| ReActLoop[ReAct Agent Loop<br/>tool-calling]
        
        LineupOptimizer --> OptimizerSvc[Optimizer Service<br/>Deterministic Math]
        
        ReActLoop --> Orchestrator[AI Service]
        LineupOptimizer --> Orchestrator
        
        ReActLoop --> RAG[RAG Pipeline/News Service]
        ReActLoop --> LeagueSvc[League/Team Context Service]
    end
    
    subgraph "Intelligence Providers"
        Orchestrator --> Gemini[Google Gemini 2.0 Flash]
        Orchestrator -.-> Ollama[Local: Llama 3.1 / Ollama]
    end
    
    subgraph "Data & Persistence"
        RAG --> SupabaseVector[Supabase pgvector]
        LeagueSvc --> SupabaseDB[Supabase Postgres]
        OptimizerSvc --> SupabaseDB
        API_Agent --> ESPN[ESPN Private API]
    end
```

## Agentic AI Execution

All intelligence flows through a single path: the **LangGraph Supervisor** (`/api/agent/chat`). The Supervisor classifies intent deterministically and routes to one of two execution subgraphs:

1. **LineupOptimizerGraph** (`lineup_optimization` intent): 6-node deterministic optimizer ending in a single focused LLM synthesis call.
2. **ReAct Agent Loop** (all other intents): Iterative tool-calling loop with access to the full 14-tool registry — player research, roster analysis, waiver wire, news retrieval, and more.

## Key Architectural Principles

1. **Setting-Driven Perspective**: The core logic is driven by the user's `activeLeagueId` and `activeTeamId` settings. The system can switch perspective to any team in a league (e.g., to simulate an opponent) simply by changing these settings.
2. **AI-First Orchestration**: The AI is not a separate feature but the primary interface for decision-making.
3. **Hybrid RAG**: Combines structured league data (rosters, scoring) with unstructured news and intelligence (injury reports, trade rumors).
4. **Edge Readiness**: Built on Next.js 15+ with Tailwind CSS v4, optimized for low latency and responsive interactions.

## Deployment Stack

- **Frontend/Backend**: Next.js (Deployed on Vercel)
- **Database/Auth**: Supabase (PostgreSQL + pgvector)
- **AI Models**: Google Gemini 2.0 Flash (via Google Generative AI SDK)
- **Data Ingestion**: Custom TypeScript clients for ESPN and RSS scraping.

## Sync Orchestration

FanVise now separates league synchronization from news intelligence ingestion so costly AI/pgvector writes only happen on explicit paths.

- **Scheduled News Sync (automatic, restricted):**
  - Route: `GET /api/cron/news`
  - Scope: **news-only** ingestion (`fetchAndIngestNews`) with Gemini extraction/embeddings.
  - Guardrails: production-only, optional `CRON_SECRET`, and strict UTC windows (`11:00` and `22:00`).
  - Trigger: GitHub Actions workflow `.github/workflows/news-ingest-cron.yml`.

- **Manual News Sync (operator action):**
  - Route: `POST /api/news/sync`
  - Scope: **news-only** ingestion/backfill.
  - Guardrails: requires explicit intent header `x-fanvise-sync-intent: manual-news-sync`.
  - UI: Dashboard `Sync News` button with last-sync label.

- **League Sync (separate from news):**
  - Routes: `POST /api/sync`, `POST /api/sync/player-status`, `POST /api/sync/daily-leaders`
  - Scope: ESPN league metadata, transactions, player status snapshots, and daily leaders.
  - Single-league mode: league/season are read from `NEXT_PUBLIC_ESPN_LEAGUE_ID` and `NEXT_PUBLIC_ESPN_SEASON_ID`.
  - Note: daily leaders sync now performs a best-effort schedule sync if no scoring period can be resolved yet.
  - UI: Dashboard `Sync League` button.

## Production Mode Notes (Current)

- **Current live mode**: single-league, env-driven perspective (not full multi-user `profiles`/`user_leagues` flow).
- **Public perspective fallback**: controlled by `ALLOW_PUBLIC_PERSPECTIVE_FALLBACK` (and defaults to enabled outside production).
- **Gemini retry cap**: `RETRY_MAX_DELAY_MS` is used to prevent long 429 backoffs from causing runtime hangs.

## Rollback / Future Reversal

When multi-user auth is fully implemented in production, revert this temporary single-league posture:

1. Set `ALLOW_PUBLIC_PERSPECTIVE_FALLBACK=false`.
2. Keep `user_leagues` populated for authenticated users and enforce membership-only perspective.
3. Optionally remove first-team fallback defaults in client perspective resolution.
