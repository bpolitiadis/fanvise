# Models & Environments

FanVise is designed to be model-agnostic, supporting both high-performance cloud models and privacy-focused local models.

## AI Providers

The system is controlled via the `AI Service` (`src/services/ai.service.ts`), which routes requests based on environment variables.

### 1. Google Gemini (Cloud)
Used for production and high-scale intelligence extraction.
- **Core Model**: `gemini-2.0-flash` (Optimized for speed/latency).
- **Embedding Model**: `text-embedding-004`.
- **Key Features**: Native JSON mode for intelligence extraction, high context window.

### 2. Ollama (Local)
Used for local development or private deployments.
- **Core Model**: `deepseek-r1:14b` (Recommended) or `llama3`.
- **Embedding Model**: `nomic-embed-text`.
- **Key Features**: Zero-cost inference, local data privacy.

---

## Environment Configuration

Create a `.env.local` file with the following variables to configure the intelligence layer:

### Core AI Settings
| Variable | Description | Default |
| :--- | :--- | :--- |
| `GOOGLE_API_KEY` | API Key for Vertex AI / Gemini. | *Required for Cloud* |
| `USE_LOCAL_AI` | Set to `true` to use Ollama instead of Gemini. | `false` |
| `GEMINI_MODEL` | The specific Gemini variety to use. | `gemini-2.0-flash` |
| `OLLAMA_MODEL` | The local model name in Ollama. | `deepseek-r1:14b` |

### RAG & Embedding Settings
| Variable | Description | Default |
| :--- | :--- | :--- |
| `EMBEDDING_PROVIDER` | `gemini` or `ollama`. | `gemini` |
| `GEMINI_EMBEDDING_MODEL`| Model for generating vector embeddings. | `text-embedding-004` |
| `OLLAMA_EMBEDDING_MODEL`| Local embedding model name. | `nomic-embed-text` |

### External Integrations
| Variable | Description |
| :--- | :--- |
| `ESPN_SWID` | Private ESPN API Session ID (SWID). |
| `ESPN_S2` | Private ESPN API Session Cookie (S2). |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY`| Supabase Service Key (used for news ingestion). |
