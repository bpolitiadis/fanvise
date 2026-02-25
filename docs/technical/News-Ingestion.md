# The News Ingestion Engine

FanVise separates the act of *ingesting intelligence* from the act of *querying it*. The News Ingestion Engine fetches unstructured data, parses it, structures it via LLMs, and stores it within Supabase for later retrieval.

## ⚙️ Core Breakdown: `news.service.ts` & `news-ingest.ts`

The architecture leverages two primary facets:

1. **The Scripts (`src/ops/news-ingest.ts`)**: Operational harnesses meant to be executed via CLI (`pnpm news:ingest`) or deployed cron functions. They bootstrap environments, initiate the import process, and handle exit codes cleanly.
2. **The Logic (`src/services/news.service.ts`)**: The heavily optimized pipeline that reads syndication feeds, calls `extractIntelligence` prompts via Gemini, creates dense vectors (`getEmbedding`), and upserts data into Supabase `news_items`.

### Scheduled Cron Sync vs Manual Operator Sync

*   **Scheduled Cron Sync:** Triggered automatically via GitHub Actions (e.g., `.github/workflows/news-ingest-cron.yml`) twice daily. It heavily throttles execution utilizing small batch sizes (`NEWS_INGEST_BATCH_SIZE`) to stay within cloud provider rate limits and ensure continuous slow-drip intelligence ingestion.
*   **Manual Operator Sync:** Initiated by clicking "Sync News" within the UI dashboard. It invokes `POST /api/news/sync` with specific intent headers (`x-fanvise-sync-intent: manual-news-sync`). This is utilized for urgent manual backfills following major NBA trade deadlines or breaking injury reports.

## 🪪 ESPN Playercard GUID Deduplication

A critical vulnerability in massive RSS ingestion is the duplication of minor news blurbs regarding the same event, which bloats the vector database and distorts the hybrid retrieval scores by showing the LLM the identical event 5 times.

To mitigate this, the engine employs a **GUID Deduplication Strategy**:
* If an ingested item possesses a native GUID (Globally Unique Identifier), it is explicitly saved to the `guid` column during generation.
* Prior to processing via the costly AI extraction prompt, a rapid `supabase.from('news_items').select('id')` query executes checking for matches on either the `url` OR `guid` via a compound `.or()` statement.
* This ensures that multi-feed aggregate reports pointing to the exact same core ESPN Playercard ID are squashed instantly at the ingestion boundary.

## 🚀 Room for Improvement / Next Steps
* **Phase 3 Multi-User Auth Feeds:** As multi-tenancy expands, `news.service.ts` must evolve to filter specific sources based on individual user preference profiles, pulling configuration settings dynamically instead of utilizing a hardcoded feed registry.
* **Webhook Listeners:** Transitioning from polling (RSS) to pushing (Webhooks) from verified NBA news sources can greatly drop the TTF (Time-To-Fetch) for late-breaking game status updates.
