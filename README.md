# FanVise

**The Intelligent Edge for Fantasy Basketball.**

FanVise is a next-generation, AI-native platform designed for ESPN Fantasy Basketball (H2H Points). It shifts the traditional fantasy sports experience from static dashboards to strategic dialogue, acting as your **General Manager**—a data-obsessed, highly analytical co-manager providing real-time lineup optimizations, free-agent scouting, and matchup analysis.

## 🧠 The Agentic AI Architecture

FanVise operates through a unified AI execution path driven by a **LangGraph Supervisor**. By fusing real-time ESPN data with unstructured NBA news, the system grounds every generated response in your precise league context (scoring formats, roster availability, schedule density).

### Core Flow:

- **Agentic Endpoint (`/api/agent/chat`)**: The sole entry point for AI communication.
- **Supervisor Routing**: The Supervisor node classifies the user intent and dynamically routes to either:
  1. **LineupOptimizerGraph**: A deterministic 6-node flow specifically built for daily lineup optimization, ending in a focused LLM synthesis.
  2. **ReAct Agent Loop**: An iterative tool-calling loop utilizing a 14-tool registry (Player Research, News Search, Waiver Wire Intel, etc.) for general strategic inquiries.

*Supports both **Google Gemini 2.0 (Cloud)** and **Ollama / Llama 3.1 (Local)** via intelligent provider adapters.*

## 🚀 Getting Started

To spin up the FanVise application locally (requires Docker, Supabase CLI, and Node.js), please consult the **[Getting Started Guide](./GETTING_STARTED.md)**.

*Note: This project enforces `pnpm` (via Corepack).*

## 📚 Technical Documentation (Source of Truth)

We maintain an exhaustive, multi-tiered documentation suite within the `docs/` repository, explaining the "how" and "why" behind the codebase.

### Tier 1: Core System Overview
* **[Architecture Guide](./docs/technical/Architecture.md)**: Deep dive into the unified Next.js + Supabase + LangGraph design, including data models and synchronization orchestration.

### Tier 2: Technical Breakdowns
* **[RAG Pipeline](./docs/technical/RAG-Pipeline.md)**: Details on News Ingestion, hybrid vector retrieval (`computeHybridScore`), and graceful degradation pathways.
* **[Agent Orchestration](./docs/technical/Agent-Orchestration.md)**: Inner workings of the LangGraph implementation, the `/api/agent/chat` endpoint, and the edge-optimized Stream Protocol.
* **[News Ingestion Engine](./docs/technical/News-Ingestion.md)**: Breakdown of the RSS pipeline, AI intelligence extraction, and the scheduling strategies.

### Tier 3: Foundation Services & Data Models
* **[Services and Data](./docs/technical/Services-and-Data.md)**: Documentation for core domain services (`LeagueService`, `OptimizerService`, `DailyLeadersService`) and Supabase schemas.

## 🔐 Authentication & Access Control

FanVise utilizes **Supabase Auth** with tightly integrated SSR cookie sessions. 
- **Perspectives Mechanism**: Application state (such as the active league and team contexts) is stored within user settings in Supabase (`public.profiles` / `public.user_leagues`), ensuring global consistency across all components and AI injections.

Read the **[Authentication System Docs](./docs/Authentication.md)** for further details.

## 🧪 AI Evaluation (FanVise Combine)

To ensure the AI Agent remains strictly factual and hallucination-free regarding roster data and injury news, FanVise includes an automated, standalone black-box evaluator.

*   Run evaluations: `pnpm test:ai`
*   Fast smoke eval (first 8 cases): `FANVISE_JUDGE_PROVIDER=none FANVISE_EVAL_FIRST_N=8 pnpm test:ai`
*   Located in `fanvise_eval/`, this runs tests directly against the local `POST /api/agent/chat` endpoint using a golden dataset.

## 📦 Game Log Backfill

To improve `game_log` tool reliability across the NBA pool, run:

*   `pnpm game-logs:backfill`

The backfill script discovers NBA players from ESPN `kona_player_info`, seeds `player_status_snapshots`, and upserts recent per-period stats into `player_game_logs`.

## ⏭️ Next Steps & Roadmap

* **Phase 3 Authentication**: Transition from a single-league posture to a full multi-tenant architecture, securely gating cross-league roster access.
* **Vector Index Scaling**: Implementing HNSW indexes in Supabase pgvector to support scaling the News RAG retrieval as historical archives grow.
* **LLM-as-a-Judge**: Enhancing the `fanvise_eval` suite with LLM-based grading metrics for qualitative evaluation over numerical thresholds.
