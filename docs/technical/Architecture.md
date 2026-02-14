# System Architecture

FanVise is an AI-native fantasy sports intelligence platform designed as a "Strategist" layer on top of existing fantasy ecosystem. The application is built as a unified, standalone Next.js solution that integrates data ingestion, AI orchestration, and RAG pipelines into a single high-performance deployment.

## High-Level Overview

The system acts as a strategic co-manager for ESPN Fantasy Basketball. It aggregates structured data (league rosters, scoring) and unstructured intelligence (news, injury reports) to provide contextually grounded strategic advice.

```mermaid
graph TD
    User((User)) -->|Iteract| WebUI[Next.js App Router]
    
    subgraph "Next.js Application (Vercel/Node.js)"
        WebUI --> API[API Routes / Server Actions]
        API --> IntelligenceSvc[Intelligence Service]
        IntelligenceSvc --> Orchestrator[AI Service]
        IntelligenceSvc --> LeagueSvc[League/Team Context Service]
        IntelligenceSvc --> RAG[RAG Pipeline/News Service]
    end
    
    subgraph "Intelligence Providers"
        Orchestrator --> Gemini[Google Gemini 2.0 Flash]
        Orchestrator -.-> Ollama[Local: DeepSeek / Llama]
    end
    
    subgraph "Data & Persistence"
        RAG --> SupabaseVector[Supabase pgvector]
        LeagueSvc --> SupabaseDB[Supabase Postgres]
        API --> ESPN[ESPN Private API]
    end
```

## Key Architectural Principles

1. **Perspective Engine**: The core logic is decoupled from a single user's team. The system can adopt the "perspective" of any team in a league to analyze strengths and weaknesses.
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
  - UI: Dashboard `Sync League` button.
