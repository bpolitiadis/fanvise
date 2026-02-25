# System Architecture Guide

FanVise is a next-generation AI-native fantasy sports platform. It acts as an autonomous **General Manager**, serving as an analytical layer atop traditional fantasy sports data schemas. Built primarily for ESPN Fantasy Basketball (H2H Points), the system unifies deterministic data ingestion with stochastic LLM interactions, delivering context-aware strategic insights rapidly to the end user.

## 🏗️ High-Level Architectural Flow

The architecture focuses on creating a single, robust AI entry point (`/api/agent/chat`) that acts as a router for all user intents. It leverages **LangGraph** to determine the optimal execution pathway—either a deterministic calculation flow or an iterative RAG (Retrieval-Augmented Generation) loop. 

```mermaid
graph TD
    %% Base Interaction
    User((User)) -->|Queries chat| WebUI[Next.js App Router]
    WebUI --> API_Agent[/api/agent/chat]
    
    %% Supervisor Routing Layer
    subgraph "Agentic Orchestration (Next.js Node/Edge)"
        API_Agent --> Supervisor{LangGraph Supervisor}
        
        Supervisor -->|Intent: Lineup Optimization| LineupOptimizer[LineupOptimizerGraph]
        Supervisor -->|Intent: General Scouting/Advice| ReActLoop[ReAct Tool-Calling Agent Loop]
    end
    
    %% Deterministic Core
    subgraph "Service Layer"
        LineupOptimizer --> OptimizerSvc[Optimizer Service]
        ReActLoop --> LeagueSvc[League/Team Context Service]
        OptimizerSvc --> MathEngine[[Zero-LLM Math/Validation]]
    end
    
    %% RAG & Intelligence 
    subgraph "Intelligence Pipeline"
        ReActLoop --> NewsSvc[News RAG Service]
        NewsSvc --> AISvc[AI Service / Extraction]
    end
    
    %% External Nodes
    subgraph "Data Storage & APIs"
        NewsSvc -.->|Hybrid Search| SupabaseVector[(Supabase pgvector)]
        LeagueSvc -.-> SupabaseDB[(Supabase Postgres)]
        OptimizerSvc -.-> SupabaseDB
        LeagueSvc -.->|Live Fetch| ESPN[ESPN Private API]
    end

    %% Providers
    AISvc -.-> Gemini[Google Gemini 2.0 Flash]
    AISvc -.-> Ollama[Llama 3.1 / Ollama Local]
```

## 🧠 Key Architectural Principles

1. **AI-Native, Single Pathway Interface:** User interactions are not sharded across static subpages; instead, intelligence requests run through the Next.js `POST /api/agent/chat` endpoint. The LLM dictates formatting and tool utilization deterministically.
2. **Contextual Grounding (The "Settings" Paradigm):** A user's active context (League ID, Team ID) dictates exactly what data is retrieved. This bounds the LLM's reality, drastically reducing hallucination by anchoring discussions strictly to the rules of the specific league and the user's specific roster.
3. **Deterministic Math, Stochastic Explanations:** Core logic like fantasy point calculation, valid lineup construction, and daily volume estimation are handled by traditional programmatic services (e.g., `OptimizerService`). The LLM is used merely to *run* the script conceptually and translate the math output into natural language.
4. **Hybrid RAG Capabilities:** FanVise merges structured database records (like player scoring averages and schedules) with rich unstructured context (embedded text from RSS news items) via Supabase pgvector.

## ⚙️ Core Operational Vectors

To ensure the AI is never working with stale data, backend data pipelines operate asynchronously alongside the application logic.

### 1. The Real-Time Intelligence (News) Sync
Implemented via a mix of scheduled executions and manual operator triggers:
* **Cron Execution**: Automated ingestion workflows configured via GitHub Actions (`.github/workflows/news-ingest-cron.yml`), hitting `GET /api/cron/news`. This workflow runs globally twice a day (11:00 UTC and 22:00 UTC).
* **Manual Override**: Operators can manually sync news via dashboard tools executing `POST /api/news/sync`, passing internal auth headers (`x-fanvise-sync-intent`).

*See [News Ingestion Engine](./News-Ingestion.md) for deeper details on RSS parsing and AI Metadata Extraction.*

### 2. League State Synchronization
Decoupled distinctly from unstructured news sync to prevent expensive database writes on every page load.
* Routes like `POST /api/sync/player-status` update snapshot statuses globally, enabling rapid pre-computations (e.g., filtering out players marked `OUT` from lineup optimization tools natively before invoking the LLM).

## 🚀 Room for Improvement / Next Steps

* **Implementation of Multi-Tenancy (Phase 3 Authentication):** At present, FanVise heavily leverages environment-driven defaults (`NEXT_PUBLIC_ESPN_LEAGUE_ID`). Expanding fully into production dictates migrating to a multi-tenant `user_leagues` enforcement layer, ensuring strict Row-Level Security (RLS) policies within Supabase govern all read operations.
* **Persistent Cache Layers:** While Next.js App Router `unstable_cache` is utilized within `LeagueService` for in-flight deduplication, architecting a true distributed cache layer (such as Upstash/Redis) for ESPN schedule lookups and daily leader stat aggregations will lower operational latency constraints significantly.
* **Asynchronous Webhook Subscriptions:** Modifying the data ingest loop from a "pull" based RSS poll, toward pushing native Webhooks for injury updates would decrease Time-To-Intelligence (TTI) for crucial fantasy decision drops.
