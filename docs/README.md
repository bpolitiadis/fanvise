# FanVise Documentation

Welcome to the FanVise documentation hub. Here you will find detailed information about the product vision, architecture, and technical implementation.

## 📜 Genesis & Product Vision
Understanding the *why* and *what* of FanVise.

*   **[Product Requirements Document (PRD)](./genesis/FanVise%20PRD_%20AI%20Fantasy%20Sports%20Strategy.md)**
    *   Defines the core value proposition: "The Intelligent Edge for Fantasy Basketball."
    *   Outlines the "FanVise Strategist" persona and "Perspective Engine."
    *   Details the pivot to a Dual-Environment Architecture (Next.js + Supabase).

## 🛠️ Technical Documentation
Deep dives into the system architecture and implementation details.

### Architecture & Design
*   **[System Architecture](./technical/Architecture.md)**: High-level overview of the Next.js, Supabase, and AI integration.
*   **[Models & Environments](./technical/Models_and_Environments.md)**: Explanation of the Dual-Environment strategy (Cloud/Gemini vs. Local/Ollama).
*   **[RAG Pipeline](./technical/RAG_Pipeline.md)**: How news retrieval, embedding, and generation works.
*   **[Database Schema](./technical/Database.md)**: Supabase Postgres schema design.
*   **[Daily Leaders Storage Design](./technical/Daily_Leaders_Storage_Design.md)**: Daily leaders data model, ESPN ingestion strategy, and chatbot integration notes.
*   **[UI & Branding](./technical/UI_and_Branding.md)**: Design system, components, and theming.

### Agents & Intelligence
*   **[API & Agents](./technical/API_and_Agents.md)**: How the AI service interacts with the application.
*   **[System Prompts](./technical/System_Prompts.md)**: The prompt engineering behind the "FanVise Strategist" persona.
*   **[Rate Limiting Strategy](./technical/rate-limiting-ai-strategy.md)**: Strategies for managing LLM API costs and limits.
*   **[AI Evaluation Framework](./technical/AI_Evaluation_Framework.md)**: Black-box QA process, judge providers, and evaluation operations.

### Audits & Roadmaps
*   **[Codebase Audit](./technical/Audit_and_Roadmap.md)**: Current state assessment and refactoring goals.
*   **[Data Audit](./technical/Data_Audit_and_Roadmap.md)**: Review of data integrity and ingestion pipelines.
*   **[AI Quality Audit](./technical/AI_Quality_Audit.md)**: RAG reliability audit, golden dataset design, and deterministic prompt hardening plan.
*   **[Architecture Review (2026-02-13)](./technical/Architecture_Review_2026-02-13.md)**: Backend architecture review, blocking/correctness findings, and caching strategy.
*   **[Security Audit (2026-02-13)](./technical/Security_Audit_Report_2026-02-13.md)**: Threat model, tenant isolation, RLS, and chat endpoint hardening.
*   **[Database Architecture and Scalability Audit (2026-02-14)](./audits/Database_Architecture_Scalability_Audit_2026-02-14.md)**: Supabase-focused scalability assessment for ESPN sync, H2H data model, and RAG indexing.

## AI QA Evaluation

*   **FanVise Combine**: Standalone black-box RAG evaluator in `../fanvise_eval/`.
*   Targets the public API endpoint `http://localhost:3000/api/chat`.
*   Run via root script: `pnpm test:ai`.
