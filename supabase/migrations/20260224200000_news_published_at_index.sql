-- Add index on news_items.published_at to avoid full table scans.
--
-- The match_news_documents RPC and lexical search queries both filter by
-- published_at (e.g. "published_at > now() - interval '14 days'"). Without an
-- index this is a sequential scan that grows with every ingested article.
--
-- A partial HNSW index on the embedding column is deferred to a separate
-- migration once the table exceeds ~5k rows (Supabase recommendation).

create index if not exists idx_news_items_published_at
    on public.news_items (published_at desc);

-- Composite index for the common combined filter: source + recency.
-- Supports per-source freshness queries and the news_sources preference feature.
create index if not exists idx_news_items_source_published_at
    on public.news_items (source, published_at desc);
