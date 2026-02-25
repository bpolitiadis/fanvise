# FanVise Documentation

Welcome to the FanVise documentation hub. Here you will find detailed information about the product vision, architecture, and technical implementation.

## 📜 Genesis & Product Vision
Understanding the *why* and *what* of FanVise.

*   **[Product Requirements Document (PRD)](./genesis/FanVise%20PRD_%20AI%20Fantasy%20Sports%20Strategy.md)**
    *   Defines the core value proposition: "The Intelligent Edge for Fantasy Basketball."
    *   Outlines the "General Manager" persona and simplified Perspective logic.
    *   Details the Agentic Architecture (Next.js + Supabase + LangGraph Supervisor).

## 🛠️ Technical Documentation
Deep dives into the system architecture and implementation details.

### Architecture & Design
*   **[System Architecture](./technical/Architecture.md)**: High-level overview of the Next.js, Supabase, and AI integration.
*   **[RAG Pipeline](./technical/RAG_Pipeline.md)**: How news retrieval, embedding, and generation works.
*   **[Database Schema](./technical/Database.md)**: Supabase Postgres schema design.
*   **[Daily Leaders Storage Design](./technical/Daily_Leaders_Storage_Design.md)**: Daily leaders data model, ESPN ingestion strategy, and chatbot integration notes.
*   **[UI & Branding](./technical/UI_and_Branding.md)**: Design system, components, and theming.

### Agents & Intelligence
*   **[API & Agents](./technical/API_and_Agents.md)**: How chat endpoints, core services, and AI orchestration work. Includes the full tool registry (14 tools).
*   **[Player Research Agent](./technical/Player_Research_Agent.md)**: Details on the first active tool-calling agent.
*   **[Lineup Optimization Flow](./technical/Lineup_Optimization_Flow.md)**: End-to-end spec for the matchup optimizer. **Phase 1 (Deterministic Optimizer Core) is complete** — see `src/services/optimizer.service.ts`.
*   **[Rate Limiting Strategy](./technical/rate-limiting-ai-strategy.md)**: Strategies for managing LLM API costs and limits.
*   **[AI Evaluation Framework](./technical/AI_Evaluation_Framework.md)**: Black-box QA process, judge providers, and evaluation operations.

## 🔐 Authentication
*   **[Authentication System](./Authentication.md)**: Details the SSR cookie-based authentication flow with Google OAuth and Email/Password.

## AI QA Evaluation

*   **FanVise Combine**: Standalone black-box evaluator in `../fanvise_eval/`.
*   Targets the Agentic endpoint `http://localhost:3000/api/agent/chat`.
*   Run via root script: `pnpm test:ai`.
