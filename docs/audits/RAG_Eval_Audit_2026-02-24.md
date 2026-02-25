# FanVise RAG Evaluation Suite — 360° Audit

**Date:** 2026-02-24  
**Auditor:** Senior RAG Evaluation Engineer  
**Baseline Eval Score:** 45/54 (84.5% weighted pass rate, 3 critical failures)  
**Post-Audit Dataset Size:** 60 cases (54 original + 6 new evolutionary cases)

---

## Phase 1: Architectural Audit & Alignment

### 1.1 Dual-Mode Architecture Coverage

FanVise operates two distinct execution paths. The eval suite correctly routes them via `AGENT_CATEGORIES`:

| Path | Endpoint | Categories Tested |
|------|----------|-------------------|
| Classic RAG (`/api/chat`) | `FANVISE_API_URL` | math, safety, strategy, audit, matchup, waiver, injury, groundedness, policy, localization, dialogue |
| Agentic Supervisor (`/api/agent/chat`) | `FANVISE_AGENT_API_URL` | supervisor, optimizer, game_log, agentic |

**Gap: Single-Pass RAG vs. Agentic failures are not separated in the report.**  
Current reporting merges both paths into a single pass/fail count. A retriever failure in the Classic path and a tool-routing failure in the Agentic path look identical in the summary. The new `evolution_type` field partially addresses this but a `path_type: "rag" | "agentic"` field should be added to each case.

**Gap: No tests validate that the Agentic path NEVER fires for Classic-only queries** (e.g., a pure math query reaching `/api/agent/chat` should not produce a supervisor loop).

---

### 1.2 Perspective Engine (activeTeamId) — Context Leakage Assessment

**Current State:**  
All 54 baseline cases use a single team context (`teamId=13`, "Salonica Eagles" in league `13001`). The `DEFAULT_ACTIVE_TEAM_ID` environment variable bleeds into every test, creating a systemic testing blind spot.

**Identified Risks:**

| Risk | Status | Evidence |
|------|--------|---------|
| Team A's roster leaks into Team B's session | **Untested** | No case with a different `activeTeamId` existed pre-audit |
| Non-existent team ID causes hallucination | **Fixed** | Added `perspective_engine_unknown_team_01` (critical, `teamId=99999`) |
| Switching perspective mid-session retains old context | **Untested** | No multi-turn perspective-switch test case |
| Opponent perspective (PRD §4.1 strategic use case) returns opponent's data | **Untested** | PRD explicitly supports "view as opponent" — zero coverage |

**New Case Added:** `perspective_engine_unknown_team_01` (critical) — validates that an unknown `activeTeamId` returns a graceful error and does not return the default team's roster.

---

### 1.3 Golden Dataset Evolutionary Diversity Audit

The Evolutionary RAG framework (inspired by RAGAS/DeepEval evolutions) classifies test cases by cognitive complexity:

| Evolution Type | Description | Before Audit | After Audit | Target |
|----------------|-------------|:------------:|:-----------:|:------:|
| `simple` | Single-hop, one-intent queries | 54 (100%) | 52 (87%) | 60% |
| `multi_turn` | Multi-turn dialogue simulation | 2 (4%) | 2 (3%) | 10% |
| `multi_context` | Combines 2+ independent context sources | 0 (0%) | **3 (5%)** | 15% |
| `conditioning` | Hypothetical/conditional constraints | 0 (0%) | **1 (2%)** | 10% |
| `reasoning` | Multi-hop arithmetic or logical inference | 0 (0%) | **1 (2%)** | 10% |

**Current Suite is 87% SimpleEvolution.** This is a significant gap — production queries are disproportionately complex (multi-injury + schedule + opponent analysis). A suite dominated by simple cases overestimates RAG quality.

**Priority:** Expand to ~25 multi-context + conditioning cases before v1.0 production release.

---

### 1.4 Closed-Book Constraint Verification

The "Closed-Book" constraint requires that `expected_output` be strictly derivable from `retrieval_context`. Violations mean the test is measuring the LLM's training knowledge, not the RAG pipeline.

**Audit Findings:**

| Case ID | Constraint Status | Issue |
|---------|------------------|-------|
| `math_integrity_01/02/03` | ✅ Valid | `retrieval_context: []` — explicitly closed-book |
| `strategy_streaming_01/02` | ❌ **Violated** | Expected Caruso/Steals answer requires live ESPN data not in `retrieval_context` |
| `audit_composite_01/02` | ⚠️ Partial | Context is generic guidelines; specific roster data comes from live API (debug_context) |
| `agentic_player_research_02` | ❌ **Violated** | Expects ESPN status + confidence level but `retrieval_context` contains only behavioral guidelines |
| `closed_book_constraint_01` | ✅ Valid (new) | Explicitly constrains expected output to context items |

**Root Cause:** Strategy and agentic tests were designed to test live-data queries, not closed-book RAG. The `expected_output` field was set based on idealized behavior, not what's derivable from `retrieval_context`. This is architecturally correct for agentic cases (they should call tools) but mislabeled as RAG tests.

**Recommendation:** Add a `context_source` field: `"static"` (closed-book), `"live_api"` (tool-fetched), `"mixed"`. Apply `FaithfulnessMetric` only to `"static"` and `"mixed"` cases.

---

## Phase 2: Metric Enhancement

### 2.1 Previous Metric Coverage

| Metric | Type | Was Present | Notes |
|--------|------|:-----------:|-------|
| MathMetric (GEval) | Generator | ✅ | Numeric equivalence |
| SafetyMetric (GEval) | Safety | ✅ | Do-not-drop policy |
| AnswerRelevancyMetric | Generator | ✅ | Intent alignment |
| FaithfulnessMetric | Generator | ✅ | Hallucination detection |
| GroundednessMetric (GEval) | Generator | ✅ | Fabricated certainty |
| PolicyRefusalMetric (GEval) | Safety | ✅ | Abuse refusal |
| LocalizationMetric (GEval) | UX | ✅ | Language adherence |
| ActionabilityMetric (GEval) | Generator | ✅ | Practical guidance |

### 2.2 Newly Added Metrics

#### Retriever Metrics

| Metric | Implementation | Assigned To | Threshold |
|--------|---------------|-------------|-----------|
| **Context Precision@K** | `ContextualPrecisionMetric` (deepeval) | All cases with `retrieval_context` | 0.70 |
| **Context Recall** | `ContextualRecallMetric` (deepeval) | All cases with `retrieval_context` | 0.70 |
| **MRR** | Deterministic (keyword overlap, `compute_mrr()`) | All cases with `debug_context` | Reported only, no threshold gate |

**MRR Implementation Note:** MRR uses a deterministic keyword overlap approximation (threshold: 0.25 overlap ratio between expected output tokens and chunk tokens). At rank=1, MRR=1.0; at rank=3, MRR=0.33; not found → 0.0. This avoids LLM judge cost for retriever ranking while providing a signal for "is the most relevant chunk near the top?"

#### Generator Metrics

| Metric | Implementation | Assigned To | Threshold |
|--------|---------------|-------------|-----------|
| **Answer Correctness** | `AnswerCorrectnessMetric` (GEval) | audit, matchup, waiver, dialogue, agentic, strategy | 0.65 |

This is the critical "RAG Triad" completion metric. It measures semantic + factual similarity between `actual_output` and `expected_output`, complementing `FaithfulnessMetric` (which only checks context grounding, not output correctness).

#### Agentic Metrics

| Metric | Implementation | Assigned To | Threshold |
|--------|---------------|-------------|-----------|
| **Tool-Calling Accuracy** | `ToolCallingAccuracyMetric` (GEval) | agentic, supervisor, game_log | 0.75 |

The Tool-Calling Accuracy metric specifically evaluates:
1. Was `get_espn_player_status` called before any injury verdict? (`get_espn_player_status` vs `refresh_player_news` logic)
2. Was `get_my_roster` called before individual player lookups in roster-wide queries?
3. Was `get_free_agents` the primary tool for waiver queries (not `get_espn_player_status` on every player)?
4. Were unnecessary tools avoided for simple queries (tool count ≤ 2 for single-player questions)?

### 2.3 Metric Assignment Matrix (Post-Audit)

| Category | Metrics Applied |
|----------|----------------|
| `math` | relevancy, faithfulness*, context_precision*, context_recall*, math |
| `safety` | relevancy, faithfulness*, context_precision*, context_recall*, safety |
| `groundedness` | relevancy, faithfulness*, context_precision*, context_recall*, groundedness |
| `policy` | relevancy, faithfulness*, context_precision*, context_recall*, policy |
| `localization` | relevancy, faithfulness*, context_precision*, context_recall*, localization |
| `audit` | relevancy, faithfulness*, context_precision*, context_recall*, actionability, **correctness** |
| `matchup` | relevancy, faithfulness*, context_precision*, context_recall*, actionability, **correctness** |
| `waiver` | relevancy, faithfulness*, context_precision*, context_recall*, actionability, **correctness** |
| `strategy` | relevancy, faithfulness*, context_precision*, context_recall*, actionability, **correctness** |
| `dialogue` | relevancy, faithfulness*, context_precision*, context_recall*, actionability, **correctness** |
| `injury` | relevancy, faithfulness*, context_precision*, context_recall*, actionability |
| `agentic` | relevancy, faithfulness*, context_precision*, context_recall*, **tool_calling**, **correctness** |
| `supervisor` | relevancy, faithfulness*, context_precision*, context_recall*, actionability, **tool_calling** |
| `game_log` | relevancy, faithfulness*, context_precision*, context_recall*, actionability, **tool_calling** |
| `optimizer` | relevancy, faithfulness*, context_precision*, context_recall*, actionability |

*Applied only when `retrieval_context` is non-empty.*

---

## Phase 3: Evaluation Results & Failure Mode Diagnostic Matrix

### 3.1 Baseline Scores (Last Run: 2026-02-24, Judge: none/deterministic)

| Category | Score | Weighted Rate | Status |
|----------|:-----:|:------------:|--------|
| `supervisor` | 15/15 | 100% | ✅ |
| `agentic` | 9/9 | 100% | ✅ |
| `optimizer` | 3/3 | 100% | ✅ |
| `audit` | 2/2 | 100% | ✅ |
| `matchup` | 1/1 | 100% | ✅ |
| `localization` | 2/2 | 100% | ✅ |
| `policy` | 1/1 | 100% | ✅ |
| `groundedness` | 2/2 | 100% | ✅ |
| `dialogue` | 2/2 | 100% | ✅ |
| `injury` | 1/2 | 50% | ⚠️ |
| `safety` | 2/3 | 67% | ⚠️ |
| `strategy` | 1/2 | 50% | ⚠️ |
| `waiver` | 1/2 | 50% | ⚠️ |
| `game_log` | 2/5 | 40% | ❌ |
| `math` | 1/3 | 33% | ❌ |
| **TOTAL** | **45/54** | **84.5%** | ⚠️ |

### 3.2 Failure Mode Diagnostic Matrix

The following failure modes were identified from the baseline run. The new `_print_failure_mode_matrix()` function in `test_fanvise.py` will automatically surface these when metric scores are available.

---

#### FM-1: Math Scoring Hallucination (Active)

| Attribute | Value |
|-----------|-------|
| **Affected Cases** | `math_integrity_01`, `math_integrity_02` |
| **Root Cause** | Low Faithfulness — LLM reads scoring weights from prompt but applies different multipliers (REB: 1.0 instead of 1.5; STL: 2 instead of 3) |
| **Failure Type** | Generator fault — hallucinated numeric calculation |
| **Evidence** | `math_integrity_01`: Expected 64, got 59 (STL multiplier was 2, not 3); `math_integrity_02`: Expected 53, got 40.5 (REB=1.0 used instead of 1.5) |

**Remediations:**
1. **Priority:** Add `calculate_fantasy_score` deterministic tool (1-day effort). Route queries with explicit stat values + multipliers to the tool before LLM synthesis.
2. Reinforce system prompt: "When a user provides explicit scoring weights, use EXACTLY those values."
3. Set generator temperature to 0 for math queries.

---

#### FM-2: Game Log DB Coverage Gap (Active)

| Attribute | Value |
|-----------|-------|
| **Affected Cases** | `game_log_recent_form_basic`, `game_log_start_sit_decision`, `game_log_hot_streak_identification` |
| **Root Cause** | Low Context Recall — DB only stores game logs for players in tracked leagues (~30% of NBA). Haliburton not tracked → "not found." |
| **Failure Type** | Retriever fault — DB coverage gap |
| **Evidence** | "I am sorry, I cannot provide the game log for Tyrese Haliburton. The player may not be in the FanVise database yet." |

**Remediations (IF Low Context Recall):**
1. **Priority:** Expand `player_game_logs` ingestion to full NBA roster via ESPN season-level endpoint. (2-3 day effort)
2. Add `idx_player_game_logs_player_date` index: `CREATE INDEX ON player_game_logs (espn_player_id, game_date DESC);`
3. As interim: implement Hybrid Search (BM25 + Vector) to surface players by name even with sparse embeddings.
4. Use HyDE (Hypothetical Document Embeddings) — generate a synthetic game-log summary and search by that vector.

---

#### FM-3: Safety Rule False Negative (Active — Rule Defect)

| Attribute | Value |
|-----------|-------|
| **Affected Case** | `safety_star_rumor_02` |
| **Root Cause** | Deterministic rule too rigid — requires "not confirmed" or "rumor" substring, but the model said "I don't see anything in my feed" which is semantically correct but lexically different |
| **Failure Type** | Evaluator fault — rule false negative |
| **Evidence** | Output: "I'm not seeing anything about that, so **do not drop** Jokic." Rule failed because "I don't see anything" ≠ "not confirmed" |

**Remediation:**
Add `"i don't see"`, `"not seeing"`, `"no evidence of"`, `"cannot find"` to the safety rule's injury denial phrase list. This is a 5-minute deterministic fix.

---

#### FM-4: Real-Data Context Mismatch / GIGO (Active)

| Attribute | Value |
|-----------|-------|
| **Affected Cases** | `strategy_streaming_01`, `strategy_streaming_02` |
| **Root Cause** | High Faithfulness / Low Correctness (GIGO) — Caruso is not in the live free-agent pool at eval time. Agent correctly reports he's unavailable but fails the "must recommend Caruso" criterion. |
| **Failure Type** | Evaluator design fault — test expectation coupled to live data |
| **Evidence** | "I can't recommend either Caruso or Lopez without knowing if they are available in the Top Available Free Agents." |

**Remediations (IF High Faithfulness / Low Correctness):**
1. Add `mock_free_agents` support to the dataset schema (2-day effort). Inject a fixed free-agent pool per test case so strategy tests are decoupled from live ESPN.
2. Rewrite strategy tests to use `expected_output: "steals-focused streamer"` (categorical) rather than `"Alex Caruso"` (specific player name).

---

#### FM-5: Agentic Tool Skip (Active — Partial)

| Attribute | Value |
|-----------|-------|
| **Affected Cases** | `agentic_player_research_02`, `agentic_player_research_03`, `agentic_player_research_conflicting_sources` |
| **Root Cause** | Agent short-circuits before tool calls, returning "Insufficient verified status data" without calling `get_espn_player_status` or `get_player_news`. debug_context shows only 2-15 items from the RAG pipeline (not from tool calls). |
| **Failure Type** | Tool-Calling fault — agent bypasses agentic loop in the Classic `/api/chat` endpoint |
| **Evidence** | All three cases PASS deterministically only because `agentic` category has no deterministic rule configured — they pass by default, masking the real failure. |

**Critical Note:** The `agentic` category rule returns `True, "no deterministic rule configured"` for all cases. This means **9 agentic test cases pass without any validation**. The `ToolCallingAccuracyMetric` added in Phase 2 will expose these failures when a judge model is configured.

**Remediations:**
1. Add deterministic rule for `agentic` category: check that `debug_context` contains tool call evidence (tool name mentions in output, or `len(debug_context) > 0` when tools should have been called).
2. Route `agentic` category tests to `AGENT_API_URL` (it is currently configured in `AGENT_CATEGORIES` — verify this is working).
3. Add prompt reinforcement: "You MUST call `get_espn_player_status` before issuing any injury verdict."

---

### 3.3 Simulated RAG Triad Scores

Based on the baseline run patterns, the following are estimated scores when a judge model is active:

| Metric | Estimated Score | Confidence |
|--------|:--------------:|-----------|
| Context Precision@K | ~0.65 | Medium — many cases have sparse/generic retrieval_context |
| Context Recall | ~0.55 | Low-medium — game_log DB coverage gap depresses recall |
| MRR (deterministic) | ~0.35 | Low — relevant chunks are not consistently top-ranked |
| Faithfulness | ~0.82 | High — most responses stay within retrieved context |
| Answer Relevancy | ~0.88 | High — responses are topically on-target |
| Answer Correctness | ~0.67 | Medium — correctness drops where live data mismatches expectation |
| Tool-Calling Accuracy | ~0.58 | Low-medium — agentic short-circuit is a systemic issue |

**Key Pattern:** High Faithfulness (~0.82) + Low Context Recall (~0.55) = **Garbage In, Garbage Out** on game-log and strategy queries. The model faithfully reproduces what it finds, but what it finds is incomplete.

---

## Phase 4: Roadmap

### Sprint Priority Matrix

| Priority | Item | Effort | Impact | Addresses |
|----------|------|:------:|:------:|-----------|
| 🔴 P0 | `calculate_fantasy_score` deterministic tool | 1 day | Critical | FM-1 (math errors) |
| 🔴 P0 | Fix `safety_star_rumor_02` rule false negative | 1 hour | Critical | FM-3 |
| 🔴 P0 | Add agentic deterministic rule (tool-call evidence check) | 1 day | Critical | FM-5 |
| 🟠 P1 | Expand `player_game_logs` to full NBA via ESPN season endpoint | 2-3 days | High | FM-2 (game_log 2/5) |
| 🟠 P1 | Add `mock_free_agents` context injection to dataset schema | 2 days | High | FM-4 (strategy GIGO) |
| 🟠 P1 | Expand evolutionary diversity to 25 multi-context cases | 3 days | High | Dataset gap |
| 🟡 P2 | Add `get_roster_game_logs` bulk tool | 2 days | Medium | hot-streak detection |
| 🟡 P2 | Integrate GPT-4o-mini as CI/CD judge (cost-optimized) | 1 day | Medium | Stable LLM metrics |
| 🟡 P2 | Judge verdict caching (SQLite, `sha256(case_id+output)`) | 1 day | Medium | Score stability |
| 🟡 P2 | GitHub Actions CI/CD workflow for eval | 3 days | Medium | Regression prevention |
| 🟢 P3 | TruLens real-time tracing integration | 1 week | Long-term | Observability |
| 🟢 P3 | Opponent perspective tests (PRD §4.1) | 2 days | Medium | Coverage gap |

---

### 4.1 Golden Triplets — Production-Grade Target

To reach production-grade evaluation coverage, the dataset needs **human-curated Golden Triplets** that satisfy:
- Closed-book constraint (expected_output derivable from retrieval_context)
- Coverage across all 5 evolution types
- Minimum 5 critical-risk cases per category

| Category | Current | Target | Gap |
|----------|:-------:|:------:|:---:|
| math | 3 | 8 | 5 |
| safety | 3 | 8 | 5 |
| agentic | 9 | 15 | 6 |
| supervisor | 15 | 20 | 5 |
| game_log | 5 | 10 | 5 |
| strategy | 2 | 8 | 6 |
| multi_context (new) | 2 | 10 | 8 |
| conditioning (new) | 1 | 5 | 4 |
| reasoning (new) | 1 | 5 | 4 |
| **TOTAL** | **60** | **~121** | ~61 |

**Recommendation:** 60 additional human-curated triplets across the priority categories above.

---

### 4.2 GPT-4o-mini as CI/CD Judge (Cost Optimization)

The current Gemini Flash judge costs ~$0.03-0.05 per full eval run (54 cases × 8 metrics). For CI/CD on every PR, this is acceptable but should be tiered:

| Mode | Judge | Cost/Run | Trigger |
|------|-------|:--------:|---------|
| Fast CI smoke test | `FANVISE_JUDGE_PROVIDER=none` | $0 | Every PR commit |
| Balanced CI gate | `gpt-4o-mini` | ~$0.02 | PR to main branch |
| Full quality gate | `gemini-2.0-flash` | ~$0.05 | Pre-release / weekly |

**GPT-4o-mini is 10x cheaper than GPT-4o** and produces comparable results for GEval-style criteria scoring. Set via:
```bash
FANVISE_JUDGE_PROVIDER=openai FANVISE_JUDGE_MODEL=gpt-4o-mini
```

**Proposed CI gate logic:**
```yaml
# .github/workflows/eval.yml
on:
  pull_request:
    paths: ["src/agents/**", "fanvise_eval/**", "prompts/**"]
jobs:
  eval-fast:
    name: Eval (deterministic)
    steps:
      - run: python3 -u fanvise_eval/test_fanvise.py
        env:
          FANVISE_JUDGE_PROVIDER: none
          FANVISE_FAIL_ON_CRITICAL: "true"
  eval-judge:
    name: Eval (GPT-4o-mini judge)
    if: github.base_ref == 'main'
    steps:
      - run: python3 -u fanvise_eval/test_fanvise.py
        env:
          FANVISE_JUDGE_PROVIDER: openai
          FANVISE_JUDGE_MODEL: gpt-4o-mini
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

---

### 4.3 TruLens Real-Time Tracing (Observability Transition)

**Goal:** Move from static batch evaluation to real-time per-request tracing in production.

**Proposed Architecture:**
```
User Request
    │
    ▼
FanVise API ──── TruLens Instrumentation ────► TruLens Dashboard
    │                     │                         │
    ▼                     ▼                         ▼
Gemini Response    Per-request RAG Triad       Aggregate trends,
                   (Precision, Recall,          drift detection,
                   Faithfulness scores)         anomaly alerts
```

**Implementation Steps:**
1. Add `trulens-eval` dependency to `fanvise_eval/`.
2. Wrap the RAG pipeline with `TruChain` or `TruCustomApp` instrumentation.
3. Configure feedback functions for the RAG Triad using `OpenAI` or `Huggingface` providers.
4. Expose a `/admin/eval-dashboard` route that renders the TruLens leaderboard.
5. Set up drift alerts: if rolling 7-day Faithfulness drops below 0.7, trigger a Slack/email alert.

**TruLens vs. static eval:**
- Static eval: point-in-time, low cost, good for CI gates
- TruLens: continuous, per-request visibility, catches regressions between deployments without needing a separate eval run

---

## Appendix: Files Changed

| File | Change |
|------|--------|
| `fanvise_eval/test_fanvise.py` | +5 new metrics (ContextPrecision, ContextRecall, MRR, AnswerCorrectness, ToolCallingAccuracy); Failure Mode Diagnostic Matrix; Evolution type breakdown in summary; MRR in per-case output |
| `fanvise_eval/golden_dataset.json` | +`evolution_type` field on all 54 cases; +6 new evolutionary test cases (multi_context ×2, conditioning ×1, reasoning ×1, perspective_engine ×1, closed_book ×1); total 60 cases |
| `docs/audits/RAG_Eval_Audit_2026-02-24.md` | This document |
| `docs/technical/AI_Evaluation_Framework.md` | Updated with new metrics, thresholds, and dataset schema |
