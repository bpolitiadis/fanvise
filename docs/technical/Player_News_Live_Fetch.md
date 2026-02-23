# Live Player News Fetch — Implementation Plan

**Status:** Implemented — Feb 23, 2026  
**Author:** VP Digital Solutions

---

## Problem

The `get_player_news` agent tool searches **already-ingested** news from the `news_items` table. That table is populated by scheduled RSS ingestion jobs (`fetchAndIngestNews`). If no ingest has run recently — or if a player's news item wasn't captured because the RSS feed had been pruned — the agent returns stale or empty data, even when fresh articles exist on Rotowire, ESPN, etc.

**Symptom (observed):** Agent responded "no specific injury details in the news" for players with live OUT designations on Rotowire published within the last hour.

---

## Solution

Add a new agent tool — **`refresh_player_news`** — that performs a **live, player-targeted RSS fetch at query time**, ingests any new articles immediately, and returns the enriched results to the LLM.

### Design Principles

1. **Reuse all existing infrastructure** — `processItem()`, `extractIntelligence()`, `getEmbedding()`, and Supabase upsert logic remain unchanged.
2. **Targeted, not full-sweep** — only articles whose title/content mentions the player name are processed, so one tool call ingests ≤5 items instead of scanning thousands.
3. **Deduplication is free** — `processItem()` already checks `url` / `guid` uniqueness; calling it twice is safe.
4. **No new tables** — reuses `news_items` exactly as-is.
5. **Graceful degradation** — if all feeds time out, the tool returns whatever the DB already has for the player.

---

## Architecture

```
Agent: "What's Devin Booker's injury status?"
  └─► refresh_player_news("Devin Booker")
        ├─ Fetch RSS in parallel: Rotowire, ESPN, Yahoo, CBS, RealGM
        │    (5s timeout per feed, 8s total cap)
        ├─ Filter: only items whose title/content contains "booker"
        ├─ For each match: processItem() → extractIntelligence() + getEmbedding() + upsert
        └─ DB search: searchNews("Devin Booker injury status news", 8)
             └─ Return freshly-ingested + existing items to agent
```

---

## Files Changed

| File | Change |
|---|---|
| `src/services/news.service.ts` | + `fetchPlayerSpecificNews(playerName, options?)` |
| `src/agents/shared/tool-registry.ts` | + `refreshPlayerNewsTool` registered in `ALL_TOOLS` |
| `src/agents/shared/types.ts` | + `FanviseToolName` union extended |
| `src/agents/supervisor/prompts.ts` | + Tool description for `refresh_player_news` |

---

## `fetchPlayerSpecificNews` — Function Spec

```typescript
export async function fetchPlayerSpecificNews(
  playerName: string,
  options?: { timeoutMs?: number }
): Promise<SearchNewsItem[]>
```

### Steps

1. **Normalize player name** for matching (lowercase, no punctuation).
2. **Fetch all `FEEDS` in parallel** with per-feed timeout (default 5 000 ms). Failed feeds are silently skipped.
3. **Filter items**: `title + contentSnippet` must contain ≥1 token from the player name.
4. **Deduplicate across feeds** by URL/GUID.
5. **Process each match** through `processItem()` (AI intelligence extraction + embedding + DB upsert).
6. **Return fresh DB snapshot** via `searchNews(playerName + " injury news", 10)` — this returns the newly upserted items alongside older ones, properly ranked.

### Performance Budget

| Step | Budget |
|---|---|
| RSS fetch (all feeds, parallel) | ≤ 5 s |
| AI extraction per item (capped at 2 new items) | ≤ 6 s |
| DB upsert | ≤ 1 s |
| DB search | ≤ 1 s |
| **Total** | **≤ 13 s** (well within agent's 60 s window) |

---

## `refresh_player_news` Tool — Spec

```
Name:    refresh_player_news
Input:   { playerName: string }
Output:  { refreshed: number; items: NewsItem[] }
```

### When the Agent Should Call It

- User asks about a specific player's injury/availability AND `get_player_news` returned empty or stale results (no items from the last 24 hours).
- User asks "what's the latest on X?" explicitly requesting fresh data.
- Agent is about to make a start/sit/drop recommendation for an OUT/GTD player and wants to verify current timeline.

### Ordering Rule (updated system prompt)

```
get_espn_player_status → get_player_news → [if stale] refresh_player_news → synthesize
```

---

## Fallback Chain

```
refresh_player_news returns items?
  YES → use them
  NO  → report "No recent articles found. Relying on ESPN status data only."
```

---

## Future Enhancements (not in this release)

- **Rotowire player-specific page scrape** — `https://www.rotowire.com/basketball/player.php?id=XXXX` via Playwright headless fetch for even more granular news.
- **Twitter/X NBA beat reporter monitoring** — ingest tweets from known reporters when a player name is mentioned.
- **Proactive refresh** — trigger `fetchPlayerSpecificNews` automatically when a new `player_status_snapshots` row is written with an OUT/GTD designation.
