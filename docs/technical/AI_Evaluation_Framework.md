# FanVise Combine Evaluation Framework

This document defines the black-box AI evaluation workflow for FanVise.

## Goals

- Detect arithmetic and logic errors.
- Detect hallucinations and false advice.
- Measure answer relevancy and faithfulness to retrieved context.
- Keep evaluation tooling isolated from the main Next.js app.

## Architecture

- Evaluator lives in `fanvise_eval/` (standalone Python suite).
- App under test is the public API endpoint: `POST /api/chat`.
- In development eval mode, API may return `debug_context` for faithfulness checks.

## Judge Model Strategy

Best practice is **not** to use the same model for generation and evaluation.

- **Generator (local daily usage):** local open model (for example via Ollama).
- **Judge (periodic high-confidence runs):** Gemini.
- **Fallback daily checks:** deterministic rule checks even when no judge is configured.

Recommended cadence:

- CI smoke tests: deterministic checks + local judge (optional).
- Pre-release gate: deterministic checks + Gemini judge.

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
```

## Metrics

- `MathMetric` (GEval): numeric equivalence against expected output.
- `SafetyMetric` (GEval): enforcement of "Do not drop stars on rumor" policy.
- `AnswerRelevancyMetric`: response relevance to prompt.
- `FaithfulnessMetric`: grounding against retrieval context (prefer `debug_context` in eval mode).
- `GroundednessMetric` (GEval): rejects fabricated certainty and unsupported specifics.
- `PolicyRefusalMetric` (GEval): refuses harmful requests and avoids abuse instructions.
- `LocalizationMetric` (GEval): language adherence (for example Greek prompts answered in Greek).
- `ActionabilityMetric` (GEval): practical, prioritized, executable fantasy guidance.
- Deterministic rules: category-specific hard pass/fail constraints.

Default thresholds:

- `math`: `0.90`
- `safety`: `0.80`
- `relevancy`: `0.70`
- `faithfulness`: `0.70`
- `groundedness`: `0.75`
- `policy`: `0.80`
- `localization`: `0.75`
- `actionability`: `0.75`

You can override thresholds at runtime:

```bash
FANVISE_METRIC_THRESHOLDS='{"faithfulness":0.8,"actionability":0.8}' pnpm test:ai
```

## Dataset Fields (v2+)

Each case supports the core schema:

- `id`, `category`, `input`, `expected_output`, `retrieval_context`, `passing_criteria`

Optional governance/context fields:

- `risk_level`: `critical` | `high` | `medium` (used for weighted pass rate and critical gating)
- `tags`: lightweight scenario labels
- `active_team_id` / `activeTeamId`: per-case team context
- `active_league_id` / `activeLeagueId`: per-case league context
- `team_name` / `teamName`: per-case team label
- `language`: per-case response language override

## Notes

- If `FANVISE_JUDGE_PROVIDER=none`, LLM metrics are marked as skipped unless strict mode is enabled.
- Deterministic checks always run and gate final pass/fail.
- Long model responses can require higher `FANVISE_API_TIMEOUT_SECONDS`.
- Evaluator now reports weighted pass rate and category breakdown in addition to raw pass/fail counts.
