# FanVise Architecture: Simple Chatbot (Consolidated)

> [!WARNING]
> **Legacy Architecture Document**
> This document represents the initial consolidated architecture. For the most up-to-date technical documentation, please refer to the [Technical Documentation Directory](../technical/Architecture.md).



## 1. High-Level Overview

FanVise is reimagined as a unified, simplified Next.js application. It operates as a personal fantasy sports assistant presented via a conversational interface ("Chatbot").

The core philosophy is **Simplicity & Agility**. We removed the complex multi-cloud/hybrid layers (separate Python Cloud Functions) in favor of a monolithic-but-modular Next.js architecture that leverages Server Actions and API Routes for backend logic.

```mermaid
graph TD
    User((User)) -->|Chat UI| NextJS[Next.js App (Vercel/Cloud Run)]
    
    subgraph "Next.js Server Scope"
        API[API Routes / Server Actions]
        Orchestrator[AI Orchestrator]
        RAG[RAG Pipeline]
        ESPN_Client[ESPN Connector]
        RSS_Client[RSS/News Fetcher]
    end
    
    NextJS --> API
    API --> Orchestrator
    
    Orchestrator -->|Generate| VertexAI[GCP Vertex AI (Gemini)]
    Orchestrator -->|Context| RAG
    
    RAG -->|Vector Search| Supabase[Supabase (PG + pgvector)]
    ESPN_Client -->|Fetch League Data| ESPN[ESPN Fantasy API]
    RSS_Client -->|Scrape/Feed| Internet[Internet / RSS]
    
    Supabase -->|Auth/Persist| NextJS
```

## 2. Technology Stack

-   **Framework**: Next.js 15+ (App Router).
-   **Language**: TypeScript.
-   **Styling**: Tailwind CSS (v4) + shadcn/ui.
-   **Database**: Supabase (PostgreSQL).
    -   **Auth**: Supabase Auth.
    -   **Vector Store**: `pgvector` extension for RAG.
-   **AI Model**: Google Vertex AI (Gemini Models).
-   **Hosting**: Vercel (recommended for ease) or Google Cloud Run.

## 3. Core Components

### A. The Chat Interface
-   **UI**: A clean, "ChatGPT-like" interface.
    -   Message history view.
    -   Streaming responses.
    -   Markdown rendering for rich text responses.
    -   Input area with easy access to "Quick Actions" (e.g., "Analyze My Matchup").

### B. The Brain (AI Orchestrator)
-   Located within Next.js API Routes or Server Actions.
-   Receives user query -> Decides tool usage (ESPN fetch, News search, Database query).
-   Calls Google Vertex AI to generate natural language responses.

### C. Data Integration Layers
1.  **ESPN Connector**:
    -   Direct TypeScript implementation to fetch League, Team, and Player data from ESPN's private API.
    -   Handles `swid` and `s2` cookies securely (stored in HTTP-only cookies or encrypted session).
2.  **Internet/News**:
    -   RSS Feed parser to aggregate breaking news (Rotowire, ESPN, etc.).
    -   Simple web scraper (where legally/technically permissible) for specific report pages.

### D. RAG (Retrieval-Augmented Generation)
1.  **Ingestion**:
    -   News and reports are fetched and chunked.
    -   Embeddings generated via Vertex AI (Gecko).
    -   Stored in Supabase `embeddings` table.
2.  **Retrieval**:
    -   User query is embedded.
    -   Supabase RPC call performs cosine similarity search.
    -   Relevant context is appended to the LLM prompt.

## 4. Simplification Benefits
-   **Single Repository/Language**: Everything is TypeScript. No context switching between Python/node.
-   **Lower Latency**: No cold starts from separate Cloud Functions. Direct database access.
-   **Easier Debugging**: Full stack local development (`npm run dev`) works out-of-the-box without mocking complex cloud infrastructure.
