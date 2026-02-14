# Daily Leaders: Storage & Chatbot Integration Design

## 1. What You Have Today

| Layer | Daily leaders / per-period player performance |
|-------|-----------------------------------------------|
| **Database (Supabase)** | **No.** You have `leagues`, `news_items` (RAG), `league_transactions`, `nba_schedule`, `player_status_snapshots`. None store “who performed best on day X” or per–scoring-period stats. |
| **Chatbot** | **No.** The chatbot gets context from: (1) RAG (`news_items` + `match_news_documents`), (2) league/roster snapshot (`buildIntelligenceSnapshot`), (3) player status snapshots. No daily leaders or period stats are injected. |
| **PG Vector** | **No.** Only `news_items.embedding` is used for RAG. There is no vector index over daily leaders or player performance. |

So today you do **not** store or use “daily leaders” data anywhere.

---

## 2. What the ESPN Response You Shared Actually Is

The curl you used hits the **global player pool** endpoint (no league ID):

- **URL pattern:** `.../games/fba/seasons/2026/players?scoringPeriodId=0&view=players_wl`
- **Response:** A long list of players with `id`, `fullName`, `defaultPositionId`, `ownership.percentOwned`, `eligibleSlots`, `proTeamId`, `lastNewsDate`, etc.

That response is **player metadata + ownership**, not **daily/per-period stats** (no points, rebounds, assists, or fantasy points for a specific day). So:

- It’s great for: “who’s on the waiver wire”, “who’s available”, “ownership %”.
- It’s **not** enough by itself for: “who shined yesterday?” or “daily leaders” in the sense of top fantasy performers for a given day.

For “daily leaders” (top performers for a **single day or scoring period**), ESPN’s site typically uses:

- A **leaders**-style endpoint with something like `scoringPeriodId=<id>` and `statSplit=singleScoringPeriod` (exact path can be found via Network tab on `fantasy.espn.com` → Leaders → filter by day/week).
- That endpoint would return **stats per scoring period** (e.g. fantasy points, PTS, REB, AST for that period).

So you have two data needs:

1. **Player pool / waiver context** (what your current curl gives): useful for “free agents” and ownership.
2. **Per-period performance (daily leaders)** (likely a different ESPN endpoint): required for “who shined yesterday?” and “how did my players do yesterday?”.

---

## 3. Where to Store This (Ideal Design)

### 3.1 Primary: PostgreSQL (Supabase) — structured tables

Store **source-of-truth** data in Postgres so you can:

- Power an in-app “Daily Leaders” (or “Leaders by day”) board.
- Query by date / scoring period for the chatbot and for APIs.

**Option A – One table: daily (or per-period) leaders**

- **Table:** e.g. `daily_leaders` or `player_period_stats`
- **Columns (conceptual):**
  - `id` (uuid)
  - `season_id` (text, e.g. `"2026"`)
  - `scoring_period_id` (int) — ESPN’s period for that day/week
  - `period_date` (date) — calendar date (or first day of period) for “yesterday” queries
  - `player_id` (bigint) — ESPN player id
  - `player_name` (text)
  - `position_id` (int, optional)
  - `pro_team_id` (int, optional)
  - `stats` (jsonb) — e.g. `{ "fantasy_pts": 42, "PTS": 28, "REB": 10, ... }`
  - `source` (text, e.g. `"espn_leaders"`)
  - `created_at` (timestamptz)

**Option B – Separate “player pool” snapshot (optional)**

- If you want to persist the **players_wl**-style list (for “free agents” / ownership over time), add something like `player_pool_snapshots` (e.g. `period_date`, `scoring_period_id`, `payload jsonb`) and optionally normalize top N or “leaders” into `daily_leaders` when you have a leaders endpoint.

Start with **Option A** once you have an ESPN endpoint that returns **stats per scoring period**. Use **Option B** only if you need historical waiver/ownership snapshots.

### 3.2 Chatbot: use DB, not (only) PG vector

- **Prefer querying the new table(s)** when the user asks “who shined yesterday?”, “how did my team do yesterday?”, “which free agents performed best yesterday?”:
  - In `intelligence.service`, detect these intents (keywords / simple classifier or LLM router).
  - Query `daily_leaders` (and optionally `leagues.teams` / roster) for the relevant `period_date` or `scoring_period_id`.
  - Inject the result as **structured context** into the system prompt (e.g. “Daily leaders for 2026-02-13: …” and “Your roster’s yesterday performance: …”).
- **PG vector (RAG)** is still useful for **narrative** content (news, injury reports). You can **optionally** add short, human-readable **summaries** of daily leaders (e.g. “On 2026-02-13, top performers: Player A 42 fpts, Player B 38 fpts…”) into a table with an `embedding` column and use RAG for semantic queries like “who went off recently?”. But the **primary** answer for “yesterday’s leaders” or “my team yesterday” should come from the **structured DB table**, not only RAG.

So: **DB = source of truth; chatbot = read from DB (and optionally RAG for fuzzy/summary queries).**

### 3.3 PG Vector (optional, for RAG)

- If you want the model to “find” daily-leader–style answers via semantic search:
  - Add a small table (e.g. `daily_leaders_summaries`) with a text summary per date (and optionally per league) and an `embedding vector(768)` column.
  - Run your existing embedding pipeline on that text and store it; use the same `match_news_documents`-style RPC (or a similar one) for retrieval.
- Keep this **secondary** to the structured table so answers are accurate and up to date.

---

## 4. How to Get “Daily” Data from ESPN

1. **Map “yesterday” to a scoring period**  
   Use your existing `nba_schedule` or ESPN schedule endpoint so you know which `scoringPeriodId` corresponds to “yesterday” (or “last night”).

2. **Discover the leaders endpoint**  
   In the browser: go to `fantasy.espn.com` → Basketball → your league → Leaders (or equivalent). Switch to “Single scoring period” or “Yesterday” and inspect Network tab for the API call (likely something like `.../leaders?...&scoringPeriodId=<id>&statSplit=singleScoringPeriod` or similar). The exact path may be under `lm-api-reads.fantasy.espn.com` or the same base as your current calls.

3. **Player pool (your current curl)**  
   - For **waiver/free-agent** context you can keep calling `.../players?scoringPeriodId=0&view=players_wl` (and optionally with a specific `scoringPeriodId` if ESPN supports it).
   - Store in DB only what you need (e.g. “top N by ownership” or “players that appeared in leaders for period X”) to avoid huge payloads; the full pool can be fetched on demand for a “free agents” page.

4. **Sync job**  
   - Cron (or Vercel cron): daily (e.g. after games are final) resolve “yesterday” → `scoring_period_id`, call the ESPN leaders endpoint, then upsert into `daily_leaders` (and optionally refresh player pool or summaries).

### Current Production Orchestration Note

- `daily_leaders` sync is **not** executed by the news cron route anymore.
- `GET /api/cron/news` is now **news-only** (RSS ingest + AI extraction/embeddings).
- Daily leaders refresh is part of the **league sync flow** (manual dashboard `Sync League`, or dedicated leaders route/script).
- This separation avoids coupling `daily_leaders` freshness to expensive news/Gemini runs.

---

## 5. Can You Have a “Daily Leaders Board for All Days” in the App?

**Yes.** In a later phase:

- **Backend:** Query `daily_leaders` (and any summary table) by `period_date` or `scoring_period_id`, optionally filtered by league/scoring settings.
- **Frontend:** Add a “Leaders” or “Daily leaders” page that:
  - Shows a date picker (or “yesterday” / “last 7 days”).
  - Calls an API that reads from `daily_leaders` (and possibly `player_pool_snapshots`) and returns ranked players and stats for the selected day(s).

All of this is feasible once the data is in Postgres and the sync job is in place.

---

## 6. Summary

| Question | Answer |
|---------|--------|
| Do we have daily leaders in DB/chatbot/pg vector today? | **No.** |
| Where should we store it? | **Postgres (Supabase):** e.g. `daily_leaders` (and optionally `player_pool_snapshots`). **Chatbot:** use this DB as primary; optionally add RAG over short daily-leader summaries. |
| How can the chatbot answer “which free agents shined yesterday?” / “how did my team do yesterday?”? | By **querying the new table(s)** (by date / scoring period and, for “my team”, by roster) and **injecting that into the system prompt**. Optional: RAG on daily-leader summary text. |
| Can we build a daily leaders board for all days? | **Yes**, in a later phase, by reading from the same `daily_leaders` (and related) tables and exposing an API + UI. |
| How do we get this from ESPN? | Use the **player pool** endpoint you already have for waiver/ownership context. For **daily leaders**, find the **leaders** endpoint (e.g. `statSplit=singleScoringPeriod` + `scoringPeriodId`) via Network tab, then add a **sync job** that maps “yesterday” → scoring period and upserts into `daily_leaders`. |

---

## 7. Next Steps (Concrete)

1. **Discover** the exact ESPN “leaders for one period” API (URL + query params) from the browser.
2. **Add migration:** create `daily_leaders` (or `player_period_stats`) with columns above.
3. **Implement** `EspnClient.getLeadersForPeriod(scoringPeriodId)` (or similar) and a small sync script/route that writes to `daily_leaders`.
4. **Wire chatbot:** in `intelligence.service`, on questions about “yesterday” / “daily leaders” / “my team yesterday”, query `daily_leaders` (+ roster) and append to context.
5. **(Later)** Add “Daily leaders” (and “Leaders by day”) UI and API using the same table(s).
