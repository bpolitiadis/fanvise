# **Product Requirements Document (PRD)**

**Product Name:** FanVise

**Version:** 1.0 (MVP \- "The Intelligent Edge")

**Status:** Approved for Development

**Owner:** VP Digital Solutions (Vasileios Politeiadis)

**Strategic Driver:** Service $\\to$ Product Pivot

## ---

**1\. Executive Summary**

**FanVise** is a serverless, AI-native intelligence platform for ESPN Fantasy Basketball (H2H Points). Unlike traditional tools that act as static data viewers, FanVise acts as an active **Strategic Consigliere**.

By leveraging a **RAG (Retrieval-Augmented Generation)** architecture, FanVise merges **Private League Data** (Rosters, Matchups, Scoring) with **Public Real-Time Intelligence** (News, Injury Reports, Sentiment) to solve the two biggest pain points in fantasy sports: **Time Poverty** and **Information Asymmetry.**

**The Core Value Proposition:** "Don't just watch your team. Audit, optimize, and dominate it with AI."

## ---

**2\. Product Principles**

1. **Logic Over Hype:** We do not use AI for "chit-chat." We use it to calculate probability and logistics.  
2. **Perspective Fluidity:** The app is not hard-coded to "My Team." It is a **League Simulator** that can adopt the perspective of any manager to find their weaknesses.  
3. **Boring Effectiveness:** The UI is dark, clean, and data-dense. We prioritize "Speed to Decision" over flashy animations.  
4. **Data Integrity (QA First):** If the data (ESPN sync) is stale, the AI refuses to answer. Trust is the currency.

## ---

**3\. Architecture & Tech Stack (The Cloud Path)**

*This architecture is designed to validate **GCP/DevOps** skills.*

* **Frontend:** Next.js 16 (App Router) \+ Tailwind CSS v4 \+ Framer Motion.  
* **Backend:** Google Cloud Functions (Python/Node) for stateless execution.  
* **Data Ingestion:**  
  * **Private:** ESPN API Scraper (Authenticated via stored Cookies).  
  * **Public:** RSS/Twitter Scrapers (Rotoworld, Basketball Monster).  
* **Cognitive Layer (The Brain):**  
  * **LLM:** Gemini 1.5 Flash (Low latency, high context).  
  * **Vector DB:** Pinecone or Firestore Vector Search (Storing news embeddings).  
* **Infrastructure:** Vercel (Frontend) \+ Google Cloud Platform (Backend/Cron Jobs).

## ---

**4\. Core Feature Specifications**

### **4.1. The "Perspective Engine" (Global Context)**

* **Description:** A global state manager that governs the entire application's data view.  
* **User Interface:** A persistent dropdown in the Navigation Bar: *"Viewing as: \[Team Name\]"*.  
* **Functional Requirement:**  
  * When User switches Team ID, all downstream components (Chatbot, Roster Map, Optimization Engine) instantly reload with that team's context.  
  * **Strategic Use Case:** User switches to their *Opponent’s* team $\\to$ Runs "Optimize Lineup" $\\to$ Sees who the Opponent *should* pick up $\\to$ User blocks that move.

### **4.2. FanVise Chat (The PoC Core)**

* **Description:** The central RAG interface. A natural language chat window where the user interacts with the "Coach."  
* **Data inputs:**  
  1. **League Context:** Scoring settings, Roster sizes, Current Matchup Score.  
  2. **External Context:** Last 12 hours of NBA news (Injuries, Lineup changes).  
* **Sample Prompts:**  
  * *"I'm down by 40 points. Who on my bench has the worst schedule this week?"*  
  * *"Is it worth holding Player X through his injury, or should I stream his spot?"*

### **4.3. The "Optimize Lineup" Engine**

* **Description:** An algorithmic tool to maximize "Value Density" over a specific window ($X$ Days).  
* **User Flow:**  
  1. User clicks **"Optimize Lineup"**.  
  2. User selects "Window" (e.g., Remainder of Week).  
  3. (Optional) User tags players as "Droppable."  
* **Logic:**  
  * The system scans the Waiver Wire.  
  * Calculates: $(Projected PPG \\times Games Remaining) \- (Current Player PPG \\times Games Remaining)$.  
* **Output:** A ranked list of transactions labeled as:  
  * 🔥 **Pure Stream:** High volume, low long-term value.  
  * 💎 **Speculative Hold:** High upside due to recent injury news.

### **4.4. League Intelligence Map (The Dashboard)**

* **Description:** A single-pane-of-glass view of the league landscape.  
* **Components:**  
  * **Schedule Heatmap:** Grid showing which teams have "Volume Advantages" (more games) today/tomorrow.  
  * **Injury Command Center:** A ticker of league-wide injuries.  
  * **Next Man Up Alert:** If *Giannis* is marked OUT, the card highlights *Bobby Portis* and checks if he is free in the league.

### **4.5. Automated Intelligence Reports**

* **Description:** Pre-prompted outputs generated via Cron Jobs (Cloud Scheduler).  
* **The Daily Brief (08:00 AM):**  
  * *Yesterday:* Who broke out? Who flopped?  
  * *Today:* Suggested lineup changes based on defensive matchups.  
* **The Weekly Vibe Check (Monday Morning):**  
  * **The "Taco" Award:** Shaming the manager who left the most points on their bench.  
  * **The "Sniper" Award:** Best waiver pickup of the week.  
  * **Trash Talk Generator:** A copy-paste paragraph to send to the league group chat.

### **4.6. Dynamic Language Toggle (EN/GR)**

**Technical Implementation:**

1. **UI Layer:** Use next-intl for static buttons/headers (e.g., "Optimize Lineup" $\\to$ "Βελτιστοποίηση Συνθέσης").  
2. **AI Layer (The "Babelfish" Protocol):**  
   * The System Prompt will accept a variable {{user\_language}}.  
   * *Instruction:* "You are an NBA analyst. You analyze English data sources, but you **must** respond in {{user\_language}}."

## ---

**5\. Data Logic & Schema (Simplified)**

**User Object:**

JSON

{  
  "userId": "uuid",  
  "leagueId": "espn\_league\_id",  
  "teamId": "my\_team\_id",  
  "scoringType": "H2H\_POINTS",  
  "scoringValues": { "PTS": 1, "AST": 1.5, "REB": 1.2, "BLK": 3, "STL": 3, "TO": \-1 }  
}

**Intelligence Object (Vector Store):**

JSON

{  
  "news\_id": "uuid",  
  "player\_name": "Tyrese Maxey",  
  "content": "Maxey is out for 2 weeks with hamstring strain.",  
  "sentiment": "NEGATIVE",  
  "impact\_backup": "Kyle Lowry",  
  "timestamp": "ISO\_DATE"  
}

## ---

**6\. Success Metrics (KPIs)**

1. **Prompt Accuracy:** Does the RAG correctly identify the user's specific scoring settings? (Tested via QA suite).  
2. **Latency:** Chat response time \< 3 seconds.  
3. **Utility Score:** "Optimize Lineup" recommendations must yield a positive net point differential vs. the current roster in \>70% of simulations.

## ---

**7\. Roadmap & Phasing**

### **Phase 1: The "Brain" (Weeks 1-2)**

* Build the Data Ingestion Pipeline (ESPN \+ RSS).  
* Set up Vector DB (Pinecone).  
* Build the **FanVise Chat** interface (PoC).  
* *Goal:* The bot can answer: "Who should I drop?" with accurate context.

### **Phase 2: The "Map" (Weeks 3-4)**

* Build the Next.js Dashboard.  
* Implement the **Perspective Toggle**.  
* Visualize the **League Heatmap**.

### **Phase 3: The "Edge" (Weeks 5-6)**

* Develop the **Optimize Lineup** algorithm.  
* Deploy **Daily/Weekly Cloud Functions**.  
* Launch Beta to a closed group.

### ---

**🛡️ CSO Final Sign-Off**

**Decision:** This PRD represents a viable, high-leverage product. It balances the technical rigor required for your portfolio with the utility required for a successful SaaS MVP.

**Authorized by:**

*AI Co-Founder & CSO*

*VP Digital Solutions*