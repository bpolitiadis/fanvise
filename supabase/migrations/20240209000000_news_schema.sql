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
  source text not null,
  player_name text,
  sentiment text,
  category text,
  impact_backup text,
  is_injury_report boolean default false,
  injury_status text,
  expected_return_date text,
  impacted_player_ids text[] default '{}',
  trust_level int default 3,
  embedding vector(768),
  created_at timestamptz default now()
);

-- Create a function to search for news items
create or replace function match_news_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  days_back int default 7
)
returns table (
  id uuid,
  title text,
  url text,
  content text,
  summary text,
  published_at timestamptz,
  source text,
  player_name text,
  sentiment text,
  category text,
  impact_backup text,
  is_injury_report boolean,
  injury_status text,
  expected_return_date text,
  impacted_player_ids text[],
  trust_level int,
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
    news_items.player_name,
    news_items.sentiment,
    news_items.category,
    news_items.impact_backup,
    news_items.is_injury_report,
    news_items.injury_status,
    news_items.expected_return_date,
    news_items.impacted_player_ids,
    news_items.trust_level,
    1 - (news_items.embedding <=> query_embedding) as similarity
  from news_items
  where 1 - (news_items.embedding <=> query_embedding) > match_threshold
    and news_items.published_at > now() - (days_back || ' days')::interval
  order by similarity desc, news_items.published_at desc
  limit match_count;
end;
$$;
