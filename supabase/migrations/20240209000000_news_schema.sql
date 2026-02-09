-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create a table to store news items
create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text unique not null,
  content text,
  summary text,
  published_at timestamptz not null,
  source text not null, -- e.g., 'ESPN', 'Rotowire'
  embedding vector(768), -- Google Gemini embedding dimension
  created_at timestamptz default now()
);

-- Create a function to search for news items
create or replace function match_news_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  title text,
  url text,
  content text,
  summary text,
  published_at timestamptz,
  source text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    news_items.id,
    news_items.title,
    news_items.url,
    news_items.content,
    news_items.summary,
    news_items.published_at,
    news_items.source,
    1 - (news_items.embedding <=> query_embedding) as similarity
  from news_items
  where 1 - (news_items.embedding <=> query_embedding) > match_threshold
  order by news_items.published_at desc, similarity desc -- Prioritize recency then similarity
  limit match_count;
end;
$$;
