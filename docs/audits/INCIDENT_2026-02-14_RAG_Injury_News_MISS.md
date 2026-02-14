# Incident Report: Injury News Miss in RAG Output

Date: 2026-02-14  
Status: Open  
Severity: SEV-2 (High - user-facing decision quality risk)  
Incident ID: FV-RAG-2026-02-14-001

## Summary

FanVise chat produced injury advice that stated no relevant news and suggested potential drops for `Devin Booker` and `OG Anunoby`, while external source UI evidence showed active injury updates for both players.

## Impact

- Users can receive wrong roster decisions (drop/hold/start) on injury-sensitive players.
- Trust in "Real-Time Intelligence" is degraded.
- The failure is especially dangerous for lock-time lineup actions.

## Detection

Detected from user report with attached screenshots showing injury updates:
- `Devin Booker (ankle)` update
- `OG Anunoby (toe)` update

## Verification Performed (Local Supabase)

Environment verified from `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421` (local Supabase)

Database checks performed on `news_items`:
- Total rows: `189`
- Matches for `Devin Booker`: `4` rows
- Matches for `OG Anunoby`: `0` rows
- Injury phrase checks from screenshot snippets: `0` matches

Observation:
- The specific Booker/Anunoby injury updates shown by ESPN UI are not present in local vector/news storage at query time.

## Root Cause Analysis

Primary cause:
1. **Data availability gap**  
   Required injury stories were not present in `news_items`, so RAG had no grounded evidence to cite.

Secondary contributing causes:
2. **Retrieval quality gap**  
   `searchNews()` can return semantically related but player-irrelevant injury items for broad injury prompts.
3. **Ingestion reliability issues**  
   Live ingest run observed intermittent `Ollama Embedding Error: 500`, which can skip inserts.
4. **Operational script fragility**  
   `npm run news:ingest` path can fail from env/import order in script execution flow.

## Evidence Snapshot

- `Devin Booker` rows found but none injury-labeled (`is_injury_report=false`, `injury_status=null`).
- `OG Anunoby` rows absent.
- Querying `searchNews("OG Anunoby injury update...")` returns other players' injury results.

## Scope

Potentially affected:
- Injury/availability questions for players with sparse or missed ingestion.
- Team-level prompts like "check my injured/DTD players".

Likely unaffected:
- Answers for players with abundant recent injury rows and explicit status metadata.

## Immediate Mitigation

1. Disable hard "drop" guidance when no player-specific verified status tuple exists.  
2. Enforce fallback response: "Insufficient verified status data." for missing `(player, status, timestamp, source)`.  
3. Run targeted ingest/backfill for watchlist players before advising on injury actions.

## Corrective Actions (Engineering)

1. Add watchlist-prioritized ingestion for active roster players (pre-lock priority queue).
2. Harden ingestion for embedding provider failures (retry, circuit-breaker, deferred embed queue).
3. Upgrade retrieval to player-aware hybrid rank:
   - exact player token hit
   - status keyword hit (`OUT`, `GTD`, `DTD`, `Questionable`)
   - recency
   - source trust
4. Add regression tests for named injury scenarios (`Booker`, `Anunoby`) in `fanvise_eval/golden_dataset.json`.
5. Add runtime guardrail to block "drop" recommendations unless evidence tuple exists in retrieved context.

## Assignment

Assigned Role: **Senior AI/RAG Fullstack Developer**  
Assignment Type: **Incident owner + remediation lead**  
Owner: **TBD (team to map role to specific engineer)**  
Due Date for remediation plan: **2026-02-16**

### Owner Responsibilities

- Produce fix design and implementation checklist.
- Ship mitigation patch for status tuple enforcement.
- Ship ingestion reliability improvements.
- Ship retrieval ranking improvements and evaluation tests.
- Post validation report with before/after metrics.

## Acceptance Criteria for Closure

- `OG Anunoby` and `Devin Booker` injury queries return player-specific recent items when present in feeds.
- No "drop" recommendation without verified status tuple in context.
- Critical injury regression tests pass in CI (`100%` pass for critical cases).
- Incident postmortem published with prevention controls.

## Remediation Progress (2026-02-14)

- Added canonical ESPN player-status ingestion from `view=kona_playercard` into `player_status_snapshots`.
- Added cron/manual sync integration so status snapshots refresh with news ingestion.
- Added intelligence context merge so verified status tuples can come from ESPN player-card snapshots when RSS coverage is missing.

