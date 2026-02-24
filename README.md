# FanVise

**The Intelligent Edge for Fantasy Basketball.**

FanVise is an AI-native strategic platform for ESPN Fantasy Basketball (H2H Points). It acts as a **General Manager**—your data-obsessed, trash-talking friend who bridges the gap between raw league data and winning decisions.

## 🧠 Dual-Mode AI Architecture

FanVise provides two discrete AI execution paths:

1. **Classic Mode** (`/api/chat`): High-speed, single-pass Retrieval-Augmented Generation (RAG). Perfect for instant lineup advice and summarizing daily news.
2. **Agentic Mode** (`/api/agent/chat`): Autonomous LangGraph agents capable of performing iterative, deep-dive research (e.g., live injury tracking and multi-player comparisons) via tool-calling.

You can run both modes using either **Cloud (Google Gemini 2.0)** or **Local (Ollama / Llama 3.1)** models, depending on your privacy requirements.

## 🚀 Getting Started

To spin up the application (requires Docker, Supabase, and Node), see our **[Getting Started Guide](./GETTING_STARTED.md)**.

*Note: This project uses `pnpm` (via Corepack) instead of `npm`.*

## 🔐 Authentication (Supabase Auth)

FanVise uses Supabase Auth with SSR cookie sessions (no client-side localStorage).

Required environment variables in `.env.local`:
*   `NEXT_PUBLIC_SUPABASE_URL`
*   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

Auth flows:
*   `GET /login` displays the login view (Google OAuth, Email/Password, and local Dev Login).
*   Protected routes: `/`, `/dashboard`, `/settings`, `/chat`, `/optimize`, `/league` (enforced in `src/middleware.ts`).

Read the full **[Authentication System Docs](./docs/Authentication.md)** for details.

## 📚 Documentation Hub

We maintain centralized, clean documentation for the architecture and AI models in the `docs/` folder:

*   **[Documentation Index](./docs/README.md)**
*   **[System Architecture](./docs/technical/Architecture.md)**
*   **[API & Agents (Classic vs Agentic)](./docs/technical/API_and_Agents.md)**

## Tech Stack Overview

*   **Frontend**: Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui.
*   **Backend**: Supabase (PostgreSQL + pgvector).
*   **AI Orchestration**: LangGraph.js, Google Generative AI SDK, Ollama.

## AI Evaluation (FanVise Combine)

The repository includes a standalone black-box RAG evaluation suite in `fanvise_eval/`.
*   Run with: `pnpm test:ai`
*   Evaluations target `http://localhost:3000/api/chat` using `fanvise_eval/golden_dataset.json`.

## Operations (CLI Tools)

Run operational data syncs locally from `src/ops/`:
*   `pnpm league:sync` - Sync ESPN league metadata, teams, and rosters.
*   `pnpm news:ingest` - Fetch new RSS feeds, extract data via Gemini, and generate embeddings.
*   `pnpm leaders:sync` - Sync daily player performance.
