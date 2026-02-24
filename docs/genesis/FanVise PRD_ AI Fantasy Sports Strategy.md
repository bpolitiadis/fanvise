# **Product Requirements Document (PRD)**

> [!NOTE]
> **ARCHITECTURAL SHIFT (Feb 2026):** This document reflects the pivoted architecture: a standalone **Next.js + Supabase** application with a **Dual-Environment AI** layer (Cloud or Local). The initial GCP serverless concepts have been deprecated for this phase in favor of rapid iteration and local data privacy options.

**Product Name:** FanVise

**Version:** 2.0 (Dual-Environment Architecture)

**Date:** Feb 12, 2026

**Status:** Live PoC / Iterative Development

**Owner:** VP Digital Solutions (Vasileios Politeiadis)

**Strategic Driver:** Service $\to$ Product Pivot

## ---

**1. Executive Summary**

**FanVise** is an AI-native intelligence platform for ESPN Fantasy Basketball (H2H Points). Unlike traditional tools that act as static data viewers, FanVise acts as an active **General Manager** (the data-obsessed, trash-talking friend).

By leveraging an **Environment-Adaptive RAG** architecture, FanVise merges **Private League Data** (Rosters, Matchups, Scoring) with **Public Real-Time Intelligence** (News, Injury Reports, Sentiment) to solve the two biggest pain points in fantasy sports: **Time Poverty** and **Information Asymmetry.**

**The Core Value Proposition:** "Don't just watch your team. Audit, optimize, and dominate it with AI."

## ---

**2. Product Principles**

1.  **Logic Over Hype:** We do not use AI for "chit-chat." We use it to calculate probability and logistics.
2.  **Setting-Driven Perspective:** The app is driven by the user's `leagueId` and `teamId` settings. The system can adopt the perspective of any manager (e.g., to simulate an opponent) simply by changing these settings.
3.  **Boring Effectiveness:** The UI is dark, clean, and data-dense. We prioritize "Speed to Decision" over flashy animations.
4.  **Data Integrity (QA First):** If the data (ESPN sync) is stale, the AI refuses to answer. Trust is the currency.

## ---

**3. Architecture & Tech Stack (Environment-Adaptive)**

*This architecture replaces the previous GCP Cloud Functions model with a unified Next.js monolithic-but-modular stack.*

*   **Frontend:** Next.js 15+ (App Router) + Tailwind CSS v4 + Framer Motion.
*   **Backend:** Next.js Server Actions / API Routes.
*   **Data Persistence:**
    *   **Supabase Postgres:** Relational data (User Preferences, Caches).
    *   **Supabase Vector:** Storing news embeddings for RAG.
*   **Cognitive Layer (The Brain):**
    *   **Orchestrator:** Custom `AI Service` that routes between local and cloud providers.
    *   **Cloud LLM:** Google Gemini 2.0 Flash (Low latency, high context).
    *   **Local LLM:** Ollama (Llama 3.1 recommended; supports agent tool-calling) for privacy-focused or offline-capable inference.
*   **Data Ingestion:**
    *   **Private:** ESPN API Client (Direct integration via `ESPN_S2` cookies).
    *   **Public:** RSS Polling Service (Rotowire, ESPN, CBS).

## ---

**4. Core Feature Specifications**

### **4.1. The "Perspective Engine" (Implemented)**

*   **Description:** A global state manager that governs the entire application's data view.
*   **User Interface:** A persistent dropdown in the Navigation Bar: *"Viewing as: [Team Name]"*.
*   **Functional Requirement:**
    *   When User switches Team ID, all downstream components (Chatbot, Roster Map, Optimization Engine) instantly reload with that team's context.
    *   **Strategic Use Case:** User switches to their *Opponent’s* team $\to$ Runs "Optimize Lineup" $\to$ Sees who the Opponent *should* pick up $\\to$ User blocks that move.

### **4.2. FanVise Chat (Implemented - PoC Core)**

*   **Description:** The central RAG interface. A natural language chat window where the user interacts with the "Coach."
*   **Data Inputs:**
    1.  **League Context:** Scoring settings, Roster sizes, Current Matchup Score (via `LeagueService`).
    2.  **External Context:** Last 14 days of NBA news embedded in Supabase Vector (via `NewsService`).
*   **Sample Prompts:**
    *   *"I'm down by 40 points. Who on my bench has the worst schedule this week?"*
    *   *"Is it worth holding Player X through his injury, or should I stream his spot?"*

### **4.3. Intelligence Ingestion (Implemented)**

*   **Description:** A background service that polls RSS feeds and extracts structured intelligence.
*   **Process:**
    1.  **Fetch:** Polls RSS feeds every X minutes.
    2.  **Extract:** Uses LLM (Gemini/Local) to extract metadata (Player Name, Sentiment, Impact Backup).
    3.  **Embed:** Generates vector embeddings for semantic search.
    4.  **Store:** Saves to Supabase for RAG retrieval.

### **4.4. League Intelligence Map (Partial Implementation)**

*   **Description:** A single-pane-of-glass view of the league landscape.
*   **Current Status:** Basic dashboard with "Recent Activity" and "Standings".
*   **Next Steps:**
    *   **Schedule Heatmap:** Grid showing which teams have "Volume Advantages" (more games) today/tomorrow.
    *   **Injury Command Center:** A ticker of league-wide injuries.

---

**5. Roadmap (Future Improvements)**

### **5.1. The "Optimize Lineup" Engine (Start/Sit Decision)**
*   **Status:** **Pending Implementation**.
*   **Description:** A daily roster optimization tool that answers "Who do I start today?".
*   **Canonical Technical Spec:** `docs/technical/Lineup_Optimization_Flow.md`.
*   **Logic:**
    *   **Slot Conflict Resolution:** Analyze daily schedule to find "Full Position Slots" vs "Open Slots".
    *   **Value Density:** Calculate: $(Projected PPG \times Games Remaining) - (Current Player PPG \times Games Remaining)$.
    *   **Bench Management:** Identify players on the bench who *should* be starting based on matchup favorability.
    *   **Streaming Intelligence:**
        *   Analyze "Volume Advantage" (Games Remaining this week).
        *   Identify "Droppable Candidates" (Players with gaps in schedule).
        *   Match against "Top Available Free Agents" with favorable 2-3 day schedules.
        *   Check roster fit (positional validity) for the specific streaming days.
*   **Output:** A specific "Start/Sit" recommendation list and a ranked waiver wire list labeled as **Pure Stream** or **Speculative Hold**.
*   **Implementation Direction (v1):** Build with deterministic optimizer services and chat tool/function calling first; evaluate LangGraph only when multi-step orchestration complexity requires durable workflow state.

### **5.4. Player Intelligence Enrichment (Implemented)**
*   **Status:** **Live**.
*   **Description:** Integration of deep player metadata into the Strategist's context.
*   **Features:**
    *   **Season Outlook:** Narrative summary of a player's season trajectory (e.g., "Breakout candidate", "Regression expected").
    *   **Recent News:** Real-time news updates mapped directly to the player card.

### **5.2. Automated Intelligence Reports**

*   **Status:** **Pending Implementation**.
*   **Description:** Pre-prompted outputs generated via Cron Jobs.
*   **The Daily Brief (08:00 AM):** Suggested lineup changes based on defensive matchups.
*   **The Weekly Vibe Check (Monday Morning):** Awards for best pickup/worst bench management.

### **5.3. Dynamic Language Toggle (EN/GR)**

*   **Status:** **Pending Implementation**.
*   **Concept:** The "Babelfish" Protocol. The System Prompt accepts a `{{user_language}}` variable to force responses in Greek while analyzing English data sources.

## ---

**6. Data Logic & Schema (Simplified)**

**User Object:**

```json
{
  "userId": "uuid",
  "leagueId": "espn_league_id",
  "teamId": "my_team_id",
  "scoringType": "H2H_POINTS",
  "scoringValues": { "PTS": 1, "AST": 1.5, "REB": 1.2, "BLK": 3, "STL": 3, "TO": -1 }
}
```

**Intelligence Object (Vector Store):**

```json
{
  "news_id": "uuid",
  "player_name": "Tyrese Maxey",
  "content": "Maxey is out for 2 weeks with hamstring strain.",
  "sentiment": "NEGATIVE",
  "impact_backup": "Kyle Lowry",
  "timestamp": "ISO_DATE",
  "embedding": [0.012, -0.34, ...]
}
```

## ---

**7. Key Success Metrics (KPIs)**

1.  **Prompt Accuracy:** Does the RAG correctly identify the user's specific scoring settings? (Tested via QA suite).
2.  **Latency:** Chat response time < 3 seconds (Streaming TTFT).
3.  **Local Performance:** Ollama (Local) response time < 10 seconds on M-series chips.