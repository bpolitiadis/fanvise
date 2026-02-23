-- Phase 1: Add full_content column for storing complete article text (ESPN API)
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS full_content text;

-- Update match_news_documents to return full_content for richer agent context
-- Must DROP first because return type is changing
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
  impacted_player_ids text[],
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
    news_items.impacted_player_ids,
    news_items.trust_level,
    1 - (news_items.embedding <=> query_embedding)::float AS similarity
  FROM news_items
  WHERE 1 - (news_items.embedding <=> query_embedding) > match_threshold
    AND news_items.published_at > now() - (days_back || ' days')::interval
  ORDER BY similarity DESC, news_items.published_at DESC
  LIMIT match_count;
END;
$$;

-- Phase 3: Trusted sources feature - system catalog
CREATE TABLE IF NOT EXISTS news_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  source_type text NOT NULL DEFAULT 'rss',
  url text,
  icon_url text,
  default_trust_level int DEFAULT 3,
  is_default boolean DEFAULT true,
  display_order int DEFAULT 0,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Phase 3: User source preferences (which sources each user trusts)
CREATE TABLE IF NOT EXISTS user_news_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES news_sources(id) ON DELETE CASCADE,
  is_enabled boolean DEFAULT true,
  custom_trust_level int,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, source_id)
);

-- RLS for news_sources (read-only for all)
ALTER TABLE news_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_sources_read" ON news_sources FOR SELECT USING (true);

-- RLS for user_news_preferences (users manage own)
ALTER TABLE user_news_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_news_preferences_select" ON user_news_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_news_preferences_insert" ON user_news_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_news_preferences_update" ON user_news_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_news_preferences_delete" ON user_news_preferences FOR DELETE USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS user_news_preferences_user_id_idx ON user_news_preferences(user_id);
CREATE INDEX IF NOT EXISTS news_items_source_idx ON news_items(source);

-- Seed default news sources (names must match news_items.source from FEEDS)
INSERT INTO news_sources (slug, name, source_type, url, default_trust_level, is_default, display_order) VALUES
  ('espn', 'ESPN', 'rss', 'https://www.espn.com/espn/rss/nba/news', 5, true, 0),
  ('rotowire', 'Rotowire', 'rss', 'https://www.rotowire.com/rss/news.php?sport=NBA', 4, true, 1),
  ('yahoo', 'Yahoo', 'rss', 'https://sports.yahoo.com/nba/rss.xml', 5, true, 2),
  ('cbs-sports', 'CBS Sports', 'rss', 'https://www.cbssports.com/rss/headlines/nba', 4, true, 3),
  ('realgm', 'RealGM', 'rss', 'https://basketball.realgm.com/rss/wiretap/0/0.xml', 4, true, 4),
  ('sportsethos', 'SportsEthos', 'rss', 'https://sportsethos.com/tag/fantasy-basketball/feed', 3, true, 5)
ON CONFLICT (slug) DO NOTHING;
