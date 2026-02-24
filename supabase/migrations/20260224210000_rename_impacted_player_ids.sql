-- N10: Rename impacted_player_ids → impacted_player_names
-- The column always stored player names, never ESPN integer IDs.
-- Renaming it removes a long-standing source of confusion for both
-- developers and the LLM when it reads the column value.

ALTER TABLE public.news_items
    RENAME COLUMN impacted_player_ids TO impacted_player_names;

-- Recreate match_news_documents to reflect the renamed column in the return type.
-- Must DROP first because the RETURNS TABLE signature is changing.
DROP FUNCTION IF EXISTS match_news_documents(vector(768), double precision, integer, integer);

CREATE FUNCTION match_news_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  days_back int default 7
)
RETURNS TABLE (
  id uuid,
  title text,
  url text,
  content text,
  summary text,
  full_content text,
  published_at timestamptz,
  source text,
  player_name text,
  sentiment text,
  category text,
  impact_backup text,
  is_injury_report boolean,
  injury_status text,
  expected_return_date text,
  impacted_player_names text[],
  trust_level int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    news_items.id,
    news_items.title,
    news_items.url,
    news_items.content,
    news_items.summary,
    news_items.full_content,
    news_items.published_at,
    news_items.source,
    news_items.player_name,
    news_items.sentiment,
    news_items.category,
    news_items.impact_backup,
    news_items.is_injury_report,
    news_items.injury_status,
    news_items.expected_return_date,
    news_items.impacted_player_names,
    news_items.trust_level,
    1 - (news_items.embedding <=> query_embedding)::float AS similarity
  FROM news_items
  WHERE 1 - (news_items.embedding <=> query_embedding) > match_threshold
    AND news_items.published_at > now() - (days_back || ' days')::interval
  ORDER BY similarity DESC, news_items.published_at DESC
  LIMIT match_count;
END;
$$;
