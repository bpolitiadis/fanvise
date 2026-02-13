# FanVise

**The Intelligent Edge for Fantasy Basketball.**

FanVise is a strategic intelligence platform for ESPN Fantasy Basketball (H2H Points). It acts as a **FanVise Strategist**—your data-obsessed, trash-talking friend who bridges the gap between raw league data and winning decisions by combining private league context with real-time NBA intelligence.

## 🧠 Dual-Environment AI Architecture

FanVise leverages a unique **Environment-Adaptive RAG** architecture, allowing you to choose your intelligence provider:

*   **Cloud Mode (Google Gemini 2.0)**: High-reasoning, low-latency performance for complex strategic analysis.
*   **Local Mode (Ollama)**: Privacy-focused, offline-capable inference using models like **DeepSeek R1** or **Llama 3**, running entirely on your local machine.

## 🚀 Getting Started

For detailed installation instructions, prerequisites (Docker, Supabase, Ollama), and configuration, please refer to our **[Getting Started Guide](./GETTING_STARTED.md)**.

## 📚 Documentation

We maintain comprehensive documentation for developers and contributors:

*   **[Documentation Index](./docs/README.md)**
    *   **[Product Vision (PRD)](./docs/genesis/FanVise%20PRD_%20AI%20Fantasy%20Sports%20Strategy.md)**
    *   **[System Architecture](./docs/technical/Architecture.md)**
    *   **[Technical Implementation](./docs/technical)**

## Key Features

*   **🎙️ FanVise Strategist**: A high-energy, data-obsessed AI persona that provides data-grounded advice with a competitive edge.
*   **📡 Real-Time Intelligence Feed**: Aggregated news from ESPN, CBS, and Rotowire.
*   **📊 Dynamic Dashboard**: High-density view of league standings and rosters.
*   **🔄 Perspective Engine**: Simulate any manager's view to find their weaknesses.

## Tech Stack

*   **Frontend**: Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui.
*   **Backend**: Supabase (PostgreSQL + Vector), Next.js Server Actions.
*   **AI/ML**: Google Vertex AI (Gemini), Ollama (Local LLMs).

## AI Evaluation (FanVise Combine)

The repository includes a standalone black-box RAG evaluation suite in `fanvise_eval/`.

*   Install and run from the root with: `npm run test:ai`
*   Evaluations target `http://localhost:3000/api/chat`
*   Dataset source: `fanvise_eval/golden_dataset.json`
*   Judge provider is configurable (`none`, `gemini`, `openai`, `ollama`, `local`) via `fanvise_eval/.env`.

## Operations and Testing

Operational workflows are handled via tracked scripts in `src/ops/`:

*   `npm run news:ingest` - Run standard news ingestion.
*   `npm run news:ingest:historical` - Run historical backfill (`NEWS_BACKFILL_PAGES` configurable).
*   `npm run league:sync` - Sync league metadata and transactions from ESPN to Supabase.

Integration verification lives in `tests/integration/` and is environment-gated:

*   `npm run test:integration` - Runs integration tests that require `RUN_INTEGRATION_TESTS=true`.
*   `npm run test:integration:live-feeds` - Also enables live RSS reachability checks.

This keeps one-off debugging out of production workflows and moves repeatable checks into test cases.
