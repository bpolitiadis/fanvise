# AI Rate Limiting & Resilience Strategy

## Problem Statement
During high-volume operations like news synchronization, calling cloud AI APIs (specifically the Gemini Free Tier) frequently results in `429 Too Many Requests` errors. These errors interrupt the data pipeline and prevent secondary enrichment (intelligence extraction and embeddings).

## Solution Architecture

### 1. Robust Retry Utility
We implemented a shared `withRetry` utility (`src/utils/retry.ts`) that manages AI call resilience.
- **Exponential Backoff**: Retries starting at 2 seconds, doubling each time.
- **Smart Quota Awareness**: Specifically parses Gemini's error messages (e.g., "retry in 23s") to wait the exact duration required by the API.

### 2. Concurrency Throttling
In `news.service.ts`, we implemented a "Polite Ingestion" pattern:
- **Batch Processing**: Instead of processing all news items at once, we process in batches of 2.
- **Artificial Delay**: A 1-second `sleep` is injected between batches to avoid bursting the API.

### 3. Graceful Fallbacks
To prevent data loss when quotas are fully exhausted:
- **NBA Keyword Gatekeeping**: We use an expanded list of top players and NBA terms to validate news relevance locally first.
- **Degraded Enrichment**: If AI extraction fails after all retries, the item is still saved as a "General" update, ensuring the feed remains populated.

## Future Roadmaps: The "Hybrid AI" Approach
To completely eliminate 429 errors for local development, we are moving towards an **Embedding Provider Architecture**. This allows:
- **Local (Ollama)**: Using a laptop's GPU for infinite, free embeddings and extraction during dev.
- **Cloud (Gemini/OpenAI)**: Using high-performance cloud models for production.
