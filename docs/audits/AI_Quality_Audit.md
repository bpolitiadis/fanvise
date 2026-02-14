# AI Quality Audit - RAG Evaluation Framework (FanVise)

Date: 2026-02-13  
Role: Lead AI Research Engineer (RAG Evaluation)

## Scope

Audit focus:
- `docs/technical/RAG_Pipeline.md`
- `docs/technical/System_Prompts.md`
- `src/services/news.service.ts`
- Supporting runtime/eval files (`src/services/intelligence.service.ts`, `src/app/api/chat/route.ts`, `fanvise_eval/`)

Goal:
- Reduce hallucinated fantasy basketball advice.
- Enforce deterministic behavior for injury/news-driven decisions.

---

## 1) RAG Pipeline Critique

### 1.1 Current behavior (implemented)

- News ingestion stores one embedding per item, derived from `title + contentSnippet`.
- Retrieval uses vector similarity via `match_news_documents` RPC (`pgvector` cosine).
- Query window defaults to recent items (`days_back`), ordered by similarity and recency.

### 1.2 Chunking strategy assessment

Verdict: **Not optimal for fantasy-news QA reliability.**

Why this is a problem:
- Current indexing is effectively **single-snippet indexing**, not passage chunking.
- High-value qualifiers are often in later paragraphs (for example: minutes restriction, game-time decision updates, official reclassification).
- Multi-topic articles get flattened into one vector; retrieval can return semantically similar but operationally wrong context.

Failure risk in fantasy basketball:
- Availability labels (`OUT`, `GTD`, `DTD`, `Questionable`) are binary decision drivers.
- Missing one qualifier can invert a stream/start/sit recommendation.

Recommendation:
- Move to **passage-level chunking** (for example 350-500 tokens with 50-80 token overlap).
- Persist chunk metadata:
  - `article_id`, `chunk_index`
  - `published_at`, `source`, `trust_level`
  - extracted entities (`player_name`, `status_terms`)
- Retrieve at chunk level, then aggregate by article/player with recency weighting.

### 1.3 Retrieval logic assessment (Hybrid Search)

Verdict: **Current retrieval is vector-only; hybrid search is missing and is a failure point.**

Observed:
- `searchNews()` calls only `match_news_documents` RPC with embedding + threshold.
- No BM25 / full-text / keyword-first retrieval path.

Why this fails:
- Vector-only can miss exact tokens critical in fantasy operations:
  - `OUT`, `GTD`, `DTD`, `OFS`, `minutes restriction`, `ruled out`, `available`.
- Semantic matches can return conceptually related articles that are status-inaccurate.
- Injury/status tasks require exact lexical grounding and conflict resolution by timestamp.

Recommendation:
- Implement **Hybrid Retrieval** = `Vector score + Keyword score + Recency + Source trust`.
- Use full-text (`to_tsvector` / `websearch_to_tsquery`) or equivalent lexical index.
- Re-rank with deterministic formula and tie-breakers:
  1. Newest status update wins.
  2. If same timestamp, higher-trust source wins.
  3. Prefer docs containing explicit status tokens.

### 1.4 Prompt-runtime mismatch

The prompt requires strict citation and links, but news context formatting currently may omit URL-level enforcement in generated claims.

Risk:
- The model is instructed to cite, but context contract does not guarantee all needed fields are present per claim.

Recommendation:
- Enforce structured context contract for each status fact:
  - `player`, `status`, `source`, `published_at`, `url`.
- Add deterministic post-check in evaluator for citation coverage.

---

## 2) Evaluation Framework (Golden Dataset)

Recommendation: **Use DeepEval** as primary framework.

Why DeepEval here:
- Already integrated in repository (`fanvise_eval/`).
- Existing CI-compatible runner, deterministic rule checks, risk levels, and judge switching are present.
- Faster to harden than introducing a second framework now.

### 2.1 Metrics to track (numbers, not vibes)

Critical KPIs:
- **Status Accuracy@1** (exact injury/availability label correctness)
- **Citation Coverage** (fraction of status claims with source + timestamp + link)
- **Faithfulness** (DeepEval `FaithfulnessMetric`)
- **Groundedness** (fabrication/overconfidence controls)
- **Critical Case Pass Rate** (must be 100% for release gates)

Suggested thresholds:
- Status Accuracy@1: `>= 0.98` on injury cases
- Citation Coverage: `>= 0.95`
- Faithfulness: `>= 0.80`
- Groundedness: `>= 0.80`
- Critical pass rate: `1.00`

### 2.2 Five mandatory automated test cases

#### Case 1: Late Scratch Override (Critical)
- **Input:** "Should I start Player X tonight?"
- **Expected Context:** Older report says Probable; newer report says Out.
- **Expected Output:** Must treat player as `Out`; recommend fallback; cite most recent source.

#### Case 2: Rumor vs Official Injury (Critical)
- **Input:** "X/Twitter says Player Y tore ACL. Should I drop now?"
- **Expected Context:** Rumor post + official source says `Day-to-Day`.
- **Expected Output:** Explicit do-not-drop, rumor rejection, official-source grounding.

#### Case 3: Name Collision Precision (High)
- **Input:** "Is Johnson playable tonight?"
- **Expected Context:** Two different players named Johnson with different statuses.
- **Expected Output:** Disambiguate identity or ask clarifier; never blend statuses/stats.

#### Case 4: Streaming Eligibility Filter (Critical)
- **Input:** "Give me 3 steals streamers for tonight."
- **Expected Context:** One candidate is `Out`, one is already rostered, one is valid FA.
- **Expected Output:** Exclude invalid options; only valid FA recommendations with reasons.

#### Case 5: Stale News Rejection (High)
- **Input:** "Update me on Player Z availability this week."
- **Expected Context:** 12-day-old status contradicted by a 3-hour-old update.
- **Expected Output:** Prioritize newest update; flag stale conflict explicitly.

### 2.3 CI/CD integration design

#### PR Gate (fast)
- Run deterministic checks + no-judge mode:
  - `FANVISE_JUDGE_PROVIDER=none pnpm test:ai`
- Fail on:
  - any critical-case deterministic failure.

#### Nightly / Pre-release Gate (high confidence)
- Run with Gemini judge:
  - `FANVISE_JUDGE_PROVIDER=gemini FANVISE_JUDGE_MODEL=gemini-2.0-flash pnpm test:ai`
- Fail on:
  - any critical failure,
  - metric thresholds below targets.

#### Reporting
- Persist markdown artifacts under `fanvise_eval/reports/`.
- Include:
  - weighted pass rate,
  - critical-case matrix,
  - regression deltas vs previous run.

---

## 3) Prompt Engineering Review - "Data-Freak" Persona

Target file family:
- `docs/technical/System_Prompts.md`
- `prompts/agents/orchestrator.ts`

### 3.1 Vague instructions identified

Potentially vague:
- "Prioritize injected context" (priority is not exclusivity).
- "Use provided news context to inform player status" (no deterministic conflict policy).
- High-energy/trash-talk directives can increase unsupported filler unless constrained.

### 3.2 Deterministically strict rewrite (recommended policy block)

Use the following strict constraints:

1. **Exclusive data scope**  
   "Use only entities present in `My Roster`, `Opponent Roster`, `Top Available Free Agents`, or `Real-Time Intelligence`."

2. **Required evidence tuple for status claims**  
   "For every injury/availability claim, require `(player, status, timestamp, source)`. If any field is missing, respond: `Insufficient verified status data.`"

3. **Conflict resolution rule**  
   "When sources conflict, choose the newest timestamp. If timestamps tie, choose higher `trust_level` source."

4. **Streaming validation rule**  
   "Do not recommend a streamer unless the player is in Free Agents and not marked `OUT`."

5. **Citation hard rule**  
   "Each status claim must include source and timestamp; append URL when present."

6. **Uncertainty behavior**  
   "If confidence is insufficient, provide uncertainty + next monitoring step. Do not output a hard recommendation."

### 3.3 Domain-specific additions

- Add explicit status ontology:
  - `OUT`, `GTD`, `DTD`, `Questionable`, `Available`, `OFS`.
- Add deterministic wording for lock-time recommendations:
  - Include "pre-lock", "30m-to-lock", and "post-update" fallback sequence.

---

## 4) Action Plan (Implementation-Oriented)

1. Introduce hybrid retrieval SQL RPC (`vector + FTS + recency + trust`).
2. Move ingestion/indexing to passage chunking with chunk metadata.
3. Extend `fanvise_eval/golden_dataset.json` with the 5 mandatory cases above.
4. Add deterministic validators:
   - status exact-match,
   - citation coverage,
   - stale-conflict resolution.
5. Gate CI merges on critical-case pass and threshold compliance.

---

## 5) Final Verdict

Current FanVise intelligence stack is a strong baseline, but **not yet robust enough** for strict fantasy basketball reliability under injury/news volatility.

Biggest reliability gap:
- lack of hybrid retrieval and passage-level chunking.

Fastest path to measurable quality:
- enforce deterministic prompt constraints + expand golden dataset + CI critical gates.

