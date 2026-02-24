# Database Schema & Data Strategy

FanVise uses Supabase (PostgreSQL) as its primary data store. The schema is optimized for the "Perspective Engine" and vector-based retrieval.

## Core Schema

### Leagues & Teams
- **`leagues`**: Central repository for ESPN league metadata, including `scoring_settings`, `roster_settings`, and `draft_detail` (stored as JSONB). The `teams` JSONB array includes `wins`, `losses`, `ties`, `pointsFor`, and `pointsAgainst` per team — populated from ESPN `mTeam record.overall` on every league sync.
- **`user_leagues`**: Junction table linking authenticated users to their specific teams and leagues.
- **`daily_leaders`**: Per-scoring-period player performance snapshots used for "who shined yesterday?", "my team yesterday", and free-agent leader context in chat.
- **`league_transactions`**: Stores ESPN transaction history (pickups, drops, trades).

### Agent Intelligence Layer

- **`player_status_snapshots`**: Canonical ESPN injury/availability snapshot per player. Updated by the `getEspnPlayerStatusTool`. Fields: `injury_status`, `injury_type`, `expected_return_date`, `droppable`, `starter_status (JSONB)`, `ownership (JSONB)`.

- **`player_game_logs`**: Per-player, per-scoring-period actual box score data. Each row = one NBA game played. Populated on-demand (cache-on-read) by the `getPlayerGameLogTool` via ESPN `kona_playercard`.
  - Key columns: `pts`, `reb`, `ast`, `stl`, `blk`, `turnovers`, `three_pm`, `fg_made/attempted/pct`, `ft_made/attempted/pct`, `minutes`, `fantasy_points`
  - `stats_raw JSONB`: full ESPN stat map (keyed by ESPN stat ID strings)
  - `fetched_at`: used for TTL checks — past periods are immutable; current period refreshes after 15 min
  - Unique on `(player_id, season_id, scoring_period_id)`
  - See: `supabase/migrations/20260223000000_player_game_logs.sql`

### Intelligence Layer (RAG)
- **`news_items`**: Stores scraped news articles and structured intelligence.
  - **`full_content`**: Full article text when available (e.g. from ESPN API). Used for richer AI context and embeddings.
- **`embedding`**: (Column in `news_items` using `vector` type) Stores the vector representation (768 dims) of the news title and content for semantic search via `match_news_documents` RPC.
- **`news_sources`**: Catalog of news sources (ESPN, Rotowire, Yahoo, etc.) with trust levels.
- **`user_news_preferences`**: Per-user toggles for which sources to include in AI recommendations (filtering at query time).

## Perspective Engine Relational Logic

The "Perspective Engine" dynamically injects context into the application based on the `activeTeamId`. It allows the system to analyze the league from the viewpoint of any specific team.

## Data Freshness & Sync

The system uses two complementary data strategies:

### Scheduled Sync (Classic RAG)
1. **RSS Ingestion**: Periodically fetches raw news from ESPN, Rotowire, CBS Sports.
2. **AI-Driven Processing**: LLM extracts structured metadata (Sentiment, Player, Category).
3. **Vector Encoding**: Content stored as 768-dim embeddings in `news_items`.
4. **RPC Matchmaking**: `match_news_documents` performs cosine similarity search.

### Cache-on-Read (Agentic Layer)
5. **Player Status Snapshots**: Fetched live from ESPN `kona_playercard` when agents query player health. Upserted into `player_status_snapshots`.
6. **Player Game Logs**: Fetched from ESPN `kona_playercard` stats array (actual per-period data, `statSourceId=0`, `statSplitTypeId=1`). Past periods cached indefinitely; current period TTL = 15 min. Service: `src/services/game-log.service.ts`.

## Index Strategy

| Table | Index | Purpose |
|---|---|---|
| `player_game_logs` | `(player_id, season_id, scoring_period_id DESC)` | Primary game log lookup |
| `player_game_logs` | `player_name` | Name-based tool resolution |
| `player_game_logs` | `game_date DESC` | Time-window queries |
| `player_status_snapshots` | `player_name` | Status lookup by name |
| `player_status_snapshots` | `pro_team_id` | Schedule join in `v_streaming_candidates` |
| `news_items` | `published_at DESC` | Date-window filter (vector RPC + lexical queries) |
| `news_items` | `(source, published_at DESC)` | Per-source freshness queries |
| `news_items` | `guid` | Deduplication during ingestion |
| `news_items` | `embedding vector_cosine_ops` | Semantic similarity search (HNSW deferred to >5k rows) |
| `nba_schedule` | `(date, home_team_id, away_team_id)` | Schedule range joins |
