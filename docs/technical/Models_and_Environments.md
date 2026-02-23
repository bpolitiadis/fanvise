# Models & Environments

FanVise is designed to be model-agnostic, supporting both high-performance cloud models and privacy-focused local models.

## AI Providers

The system is controlled via the `AI Service` (`src/services/ai.service.ts`), which routes requests based on environment variables.

### 1. Google Gemini (Cloud)
Used for production and high-scale intelligence extraction.
- **Core Model**: `gemini-2.0-flash` (Optimized for speed/latency).
- **Embedding Model**: `gemini-embedding-001`.
- **Key Features**: Native JSON mode for intelligence extraction, high context window.

### 2. Ollama (Local)
Used for local development or private deployments.
- **Core Model**: `llama3.1` (Recommended). Must support tool/function calling for agent mode; `deepseek-r1:14b` does not.
- **Embedding Model**: `nomic-embed-text`.
- **Key Features**: Zero-cost inference, local data privacy.

#### Agent Mode: Ollama vs Gemini

Local models (Ollama) can occasionally hallucinate roster/matchup data (e.g. inventing NBA team names instead of fantasy teams, or NBA game scores instead of fantasy points). If you see wrong roster players or "Memphis Grizzlies 90–103" style scores:

1. **Retry** — The anti-hallucination prompt rules often correct it on a second attempt.
2. **Switch to Gemini** — Set `USE_LOCAL_AI=false` in `.env.local`. Gemini follows tool data more reliably for agent audits. Requires `GOOGLE_API_KEY`.

---

## Evaluation Model Strategy (FanVise Combine)

For AI QA, FanVise uses a judge-provider split:

- **Generator**: the model serving `/api/chat` (often local/Ollama in development).
- **Judge**: configurable evaluator model in `fanvise_eval/test_fanvise.py`.

Best practice:

- Avoid same-model self-judging for release decisions.
- Use local judges for frequent/cheap runs.
- Run periodic Gemini-judged evaluations for higher-confidence gates.

Judge providers supported by the evaluation runner:

- `none` (deterministic-only)
- `gemini`
- `openai`
- `ollama`
- `local` (OpenAI-compatible endpoint)

---

## Environment Configuration

Create a `.env.local` file with the following variables to configure the intelligence layer:

### Core AI Settings
| Variable | Description | Default |
| :--- | :--- | :--- |
| `GOOGLE_API_KEY` | API Key for Vertex AI / Gemini. | *Required for Cloud* |
| `USE_LOCAL_AI` | Set to `true` to use Ollama instead of Gemini. | `false` |
| `GEMINI_MODEL` | The specific Gemini variety to use. | `gemini-2.0-flash` |
| `OLLAMA_MODEL` | The local model name in Ollama. Must support tool-calling for agent mode (e.g. `llama3.1`, `mistral`, `qwen2.5`). | `llama3.1` |

### RAG & Embedding Settings
| Variable | Description | Default |
| :--- | :--- | :--- |
| `EMBEDDING_PROVIDER` | `gemini` or `ollama`. | `gemini` |
| `GEMINI_EMBEDDING_MODEL`| Model for generating vector embeddings. | `gemini-embedding-001` |
| `OLLAMA_EMBEDDING_MODEL`| Local embedding model name. | `nomic-embed-text` |

### External Integrations
| Variable | Description |
| :--- | :--- |
| `ESPN_SWID` | Private ESPN API Session ID (SWID). |
| `ESPN_S2` | Private ESPN API Session Cookie (S2). |
| `NEXT_PUBLIC_ESPN_LEAGUE_ID` | Default league ID used by sync and perspective resolution in single-league mode. |
| `NEXT_PUBLIC_ESPN_SEASON_ID` | Active ESPN season used by schedule and leaders sync jobs. |
| `ALLOW_PUBLIC_PERSPECTIVE_FALLBACK` | Set to `true` in single-league production when auth/user_leagues are not yet enabled. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY`| Supabase Service Key (used for news ingestion). |

### Production Stability Controls
| Variable | Description | Suggested Value |
| :--- | :--- | :--- |
| `RETRY_MAX_DELAY_MS` | Caps 429 retry backoff to avoid request hangs/timeouts in serverless runtimes. | `3000` |

### Rollback Note (Future Multi-User)
When production moves to full multi-user auth (`auth.users` + `profiles` + `user_leagues`), switch:

- `ALLOW_PUBLIC_PERSPECTIVE_FALLBACK=false`
- Keep server-side membership enforcement as the only perspective authorization path.
