# Database Schema & Data Strategy

FanVise uses Supabase (PostgreSQL) as its primary data store. The schema is optimized for the "Perspective Engine" and vector-based retrieval.

## Core Schema

### Leagues & Teams
- **`leagues`**: Central repository for ESPN league metadata, including `scoring_settings`, `roster_settings`, and `draft_detail` (stored as JSONB).
- **`user_leagues`**: Junction table linking authenticated users to their specific teams and leagues.
- **`daily_leaders`**: Per-scoring-period player performance snapshots used for "who shined yesterday?", "my team yesterday", and free-agent leader context in chat.

### Intelligence Layer (RAG)
- **`news_items`**: Stores scraped news articles and structured intelligence.
- **`embedding`**: (Column in `news_items` using `vector` type) Stores the vector representation (1536 or 768 dims depending on provider) of the news title and content for semantic search.

## Perspective Engine Relational Logic

The "Perspective Engine" dynamically injects context into the application based on the `activeTeamId`. It allows the system to analyze the league from the viewpoint of any specific team.

## Data Freshness & Sync

The system uses an orchestrated sync strategy:
1. **RSS Ingestion**: Periodically fetches raw news from sources like ESPN, Rotowire, and CBS Sports.
2. **AI-Driven Processing**: Each news item is processed by an LLM to extract structured metadata (Sentiment, Player, Category).
3. **Vector Encoding**: Content is converted to embeddings and stored in the `news_items` table.
4. **RPC Matchmaking**: The `match_news_documents` Postgres function performs cosine similarity search between user queries and stored news.
