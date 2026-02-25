# FanVise Combine Evaluation Framework

This document defines the black-box AI evaluation workflow for FanVise.

## Goals

- Detect arithmetic and logic errors.
- Detect hallucinations and false advice.
- Measure answer relevancy and faithfulness to retrieved context.
- Measure retriever quality (precision, recall, ranking) independently of generator quality.
- Validate agentic tool-calling accuracy and intent routing correctness.
- Keep evaluation tooling isolated from the main Next.js app.

## Architecture

- Evaluator lives in `fanvise_eval/` (standalone Python suite).
- Single tested endpoint: `POST /api/agent/chat` (Agentic Supervisor).
- Routing is controlled by `AGENT_CATEGORIES = {"supervisor", "optimizer", "game_log"}`.
- In development eval mode, API may return `debug_context` for faithfulness and retriever checks.

## Judge Model Strategy

Best practice is **not** to use the same model for generation and evaluation.

- **Generator (local daily usage):** local open model (for example via Ollama).
- **Judge (periodic high-confidence runs):** Gemini Flash or GPT-4o-mini.
- **Fallback daily checks:** deterministic rule checks even when no judge is configured.

Recommended cadence:

| Mode | Judge | Cost | Trigger |
|------|-------|:----:|---------|
| Fast CI smoke test | `none` (deterministic only) | $0 | Every PR commit |
| Balanced CI gate | `gpt-4o-mini` | ~$0.02/run | PRs to main |
| Full quality gate | `gemini-2.0-flash` | ~$0.05/run | Pre-release / weekly |

## Judge Provider Configuration

Copy `fanvise_eval/.env.example` to `fanvise_eval/.env` and configure:

| Variable | Description |
| :--- | :--- |
| `FANVISE_JUDGE_PROVIDER` | `none`, `gemini`, `openai`, `ollama`, `local` |
| `FANVISE_JUDGE_MODEL` | Optional explicit judge model name |
| `FANVISE_JUDGE_BASE_URL` | Optional endpoint override (local/openai-compatible) |
| `FANVISE_STRICT_METRICS` | If `true`, unavailable metric = fail |
| `FANVISE_FAIL_ON_CRITICAL` | If `true`, any failed `risk_level=critical` case fails the run |
| `FANVISE_API_RETRIES` | Retries for transient API/network failures |
| `FANVISE_METRIC_THRESHOLDS` | Optional JSON threshold overrides per metric |
| `FANVISE_EVAL_ACTIVE_TEAM_ID` | Optional team context injection for eval payload |
| `FANVISE_EVAL_ACTIVE_LEAGUE_ID` | Optional league context injection for eval payload |
| `FANVISE_EVAL_TEAM_NAME` | Optional team name included in eval payload |
| `FANVISE_EVAL_LANGUAGE` | Optional response language in eval payload |
| `FANVISE_EVAL_FIRST_N` | If set, run only the first N cases (useful for fast smoke tests) |
| `FANVISE_EVAL_CASE_IDS` | Comma-separated case IDs to run; overrides `FANVISE_EVAL_FIRST_N` when set |

Provider-specific keys:

- Gemini: `GOOGLE_API_KEY` or `GEMINI_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Ollama: `OLLAMA_BASE_URL`
- Local openai-compatible endpoint: `LOCAL_JUDGE_API_KEY` + `FANVISE_JUDGE_BASE_URL`

## Running Evaluations

From repository root:

```bash
pnpm test:ai
```

Example modes:

```bash
# Deterministic-only mode (no LLM judge)
FANVISE_JUDGE_PROVIDER=none pnpm test:ai

# Local judge mode
FANVISE_JUDGE_PROVIDER=ollama FANVISE_JUDGE_MODEL=qwen2.5:14b-instruct pnpm test:ai

# Periodic Gemini judge mode
FANVISE_JUDGE_PROVIDER=gemini FANVISE_JUDGE_MODEL=gemini-1.5-flash GOOGLE_API_KEY=<REDACTED> pnpm test:ai

# Sanity run: specific cases only (fast, targeted validation)
FANVISE_JUDGE_PROVIDER=none FANVISE_EVAL_CASE_IDS=safety_star_rumor_01,supervisor_do_not_drop_star,routing_matchup_review_not_optimizer pnpm test:ai

# Smoke run: first 8 cases, deterministic only (~1–2 min)
FANVISE_JUDGE_PROVIDER=none FANVISE_EVAL_FIRST_N=8 pnpm test:ai
```

### Sanity / Subset Runs

For quick validation without running the full 60-case suite:

- **`FANVISE_EVAL_CASE_IDS`**: comma-separated IDs (e.g. `safety_star_rumor_01,supervisor_do_not_drop_star`). Runs only those cases. Use for targeted regression checks after intent-classifier, routing, or safety changes.
- **`FANVISE_EVAL_FIRST_N`**: integer (e.g. `8`). Runs the first N cases in dataset order. Use for fast smoke tests.

When both are set, `FANVISE_EVAL_CASE_IDS` takes precedence. Combine with `FANVISE_JUDGE_PROVIDER=none` for fastest runs.

## Metrics

### Retriever Metrics (measure RAG pipeline quality)

- `ContextualPrecisionMetric`: what fraction of the top-K retrieved chunks are relevant to the query. Requires judge model. Applied to all cases with non-empty `retrieval_context`. Threshold: `0.70`.
- `ContextualRecallMetric`: what fraction of the required information was present in retrieved context. Requires judge model. Applied to all cases with non-empty `retrieval_context`. Threshold: `0.70`.
- `MRR` (Mean Reciprocal Rank): deterministic keyword-overlap approximation — rank of the first relevant chunk in `debug_context`. Reported as a per-case value and summary average. No threshold gate (diagnostic only).

### Generator Metrics (measure LLM output quality)

- `MathMetric` (GEval): numeric equivalence against expected output. Threshold: `0.90`.
- `SafetyMetric` (GEval): enforcement of "Do not drop stars on rumor" policy. Threshold: `0.80`.
- `AnswerRelevancyMetric`: response relevance to prompt. Threshold: `0.70`.
- `FaithfulnessMetric`: grounding against retrieval context (prefer `debug_context` in eval mode). Threshold: `0.70`.
- `GroundednessMetric` (GEval): rejects fabricated certainty and unsupported specifics. Threshold: `0.75`.
- `PolicyRefusalMetric` (GEval): refuses harmful requests and avoids abuse instructions. Threshold: `0.80`.
- `LocalizationMetric` (GEval): language adherence (for example Greek prompts answered in Greek). Threshold: `0.75`.
- `ActionabilityMetric` (GEval): practical, prioritized, executable fantasy guidance. Threshold: `0.75`.
- `AnswerCorrectnessMetric` (GEval): semantic + factual similarity between actual and expected output. Applied to audit, matchup, waiver, dialogue, agentic, strategy categories. Threshold: `0.65`.

### Agentic Metrics (measure tool-calling correctness)

- `ToolCallingAccuracyMetric` (GEval): validates correct tool selection and sequencing. Checks `get_espn_player_status` is called before injury verdicts, `get_my_roster` before bulk player lookups, `get_free_agents` as primary tool for waiver queries, and tool count ≤ 2 for single-player questions. Applied to agentic, supervisor, game_log categories. Threshold: `0.75`.

### Deterministic Rules

Category-specific hard pass/fail constraints that run independently of judge model availability. See `fanvise_eval/test_fanvise.py → run_rule_checks()` for full implementation.

### Default Thresholds

```
math:              0.90
safety:            0.80
relevancy:         0.70
faithfulness:      0.70
groundedness:      0.75
policy:            0.80
localization:      0.75
actionability:     0.75
context_precision: 0.70
context_recall:    0.70
correctness:       0.65
tool_calling:      0.75
```

You can override thresholds at runtime:

```bash
FANVISE_METRIC_THRESHOLDS='{"faithfulness":0.8,"actionability":0.8}' pnpm test:ai
```

## Dataset Fields (v3)

Each case supports the core schema:

- `id`, `category`, `input`, `expected_output`, `retrieval_context`, `passing_criteria`

Governance / context fields:

- `risk_level`: `critical` | `high` | `medium` (used for weighted pass rate and critical gating)
- `tags`: lightweight scenario labels
- `active_team_id` / `activeTeamId`: per-case team context injection
- `active_league_id` / `activeLeagueId`: per-case league context injection
- `team_name` / `teamName`: per-case team label
- `language`: per-case response language override

**New in v3:**
- `evolution_type`: `simple` | `multi_turn` | `multi_context` | `conditioning` | `reasoning` — classifies cognitive complexity of the test case. Used in the Evolution Type Breakdown section of the eval report.

**Planned (mock_context):**
- `mock_context`: optional object to inject fixed free-agent pool or roster data for strategy/waiver cases, decoupling them from live ESPN data. Requires backend support (eval API accepts and passes mock data to tools). Not yet implemented.
- `mock_free_agents` *(planned)*: pre-seed a fixed free-agent pool to decouple strategy tests from live ESPN data.

### Evolution Type Definitions

| Type | Description | Example |
|------|-------------|---------|
| `simple` | Single-hop, one-intent, directly answerable | "Is Giannis playing tonight?" |
| `multi_turn` | Simulates a multi-turn conversation with context carried forward | "Caruso is now OUT — replan" |
| `multi_context` | Requires combining 2+ independent retrieved contexts | "Trade analysis: Reid vs Draymond, given schedule + category fit" |
| `conditioning` | Hypothetical constraint applied before answering | "Assuming all DTD players are ruled out, who starts?" |
| `reasoning` | Multi-hop arithmetic or logical inference required | "Is it feasible to close a 61-point gap with 50 games left?" |

**Target distribution for production-grade dataset:** 60% simple, 10% multi_turn, 15% multi_context, 10% conditioning, 5% reasoning.

## Notes

- If `FANVISE_JUDGE_PROVIDER=none`, LLM metrics are marked as skipped unless strict mode is enabled.
- Deterministic checks always run and gate final pass/fail.
- Long model responses can require higher `FANVISE_API_TIMEOUT_SECONDS`.
- Evaluator now reports weighted pass rate and category breakdown in addition to raw pass/fail counts.
