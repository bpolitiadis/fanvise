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
*   **[UI & Branding](./technical/UI_and_Branding.md)**: Design system, components, and theming.

### Agents & Intelligence
*   **[API & Agents](./technical/API_and_Agents.md)**: How the AI service interacts with the application.
*   **[System Prompts](./technical/System_Prompts.md)**: The prompt engineering behind the "FanVise Strategist" persona.
*   **[Rate Limiting Strategy](./technical/rate-limiting-ai-strategy.md)**: Strategies for managing LLM API costs and limits.

### Audits & Roadmaps
*   **[Codebase Audit](./technical/Audit_and_Roadmap.md)**: Current state assessment and refactoring goals.
*   **[Data Audit](./technical/Data_Audit_and_Roadmap.md)**: Review of data integrity and ingestion pipelines.
