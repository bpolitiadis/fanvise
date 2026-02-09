import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js'; // Use direct client for service role
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

const parser = new Parser();

export interface IntelligenceObject {
    player_name: string | null;
    sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    category: 'Injury' | 'Trade' | 'Lineup' | 'Performance' | 'Other' | 'General';
    impact_backup: string | null;
    is_injury_report: boolean;
    injury_status: string | null;
    expected_return_date: string | null;
    impacted_player_ids: string[];
    trust_level: number;
}

// RSS Feeds
// RSS Feeds with Trust Ranking
const FEEDS = [
    { source: 'ESPN', url: 'https://www.espn.com/espn/rss/nba/news', trust_level: 5 },
    { source: 'Rotowire', url: 'https://www.rotowire.com/rss/news.php?sport=NBA', trust_level: 4 },
    { source: 'Yahoo', url: 'https://sports.yahoo.com/nba/rss.xml', trust_level: 5 },
    { source: 'CBS Sports', url: 'https://www.cbssports.com/rss/external/nba/', trust_level: 4 },
    { source: 'Fox Sports', url: 'https://api.foxsports.com/v1/rss?partnerKey=zBaFxY3pS69W6X76G9V4985zbdP95A8D&tag=nba', trust_level: 4 }
];

// Initialize Supabase with Service Role Key (preferred) or Anon Key (fallback for dev)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const embeddingModelCache = new Map<string, GenerativeModel>();
const embeddingModelCandidates = [
    "gemini-embedding-001", // Discovered working list
    "embedding-001",
    process.env.GEMINI_EMBEDDING_MODEL,
    "text-embedding-004",
    "text-embedding-001",
].filter(Boolean) as string[];

const getEmbeddingModel = (modelName: string): GenerativeModel => {
    const cached = embeddingModelCache.get(modelName);
    if (cached) return cached;

    const model = genAI.getGenerativeModel({ model: modelName });
    embeddingModelCache.set(modelName, model);
    return model;
};

const generationModelCandidates = [
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-1.5-flash",
    "gemini-pro-latest",
].filter(Boolean) as string[];

const extractIntelligence = async (text: string): Promise<IntelligenceObject> => {
    let lastError: unknown;

    for (const modelName of generationModelCandidates) {
        try {
            console.log(`[News Service] Attempting intelligence extraction with: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });

            const prompt = `
                Analyze the following NBA news snippet and return a JSON object with:
                - player_name: (string|null) Primary player mentioned.
                - sentiment: (POSITIVE|NEGATIVE|NEUTRAL)
                - category: (Injury|Trade|Lineup|Performance|Other)
                - impact_backup: (string|null) The name of the teammate who gains fantasy value due to this news.
                - is_injury_report: (boolean) Is this primarily an injury update?
                - injury_status: (string|null) OFS, GTD, OUT, Day-to-Day, or Questionable.
                - expected_return_date: (string|null) ISO format if mentioned.
                - impacted_player_ids: (string[]) List of player names affected.

                Snippet: "${text}"
            `;

            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            });

            const intelligence = JSON.parse(result.response.text());
            return {
                ...intelligence,
                trust_level: 3 // Default trust level, overridden by feed
            };
        } catch (error: any) {
            lastError = error;
            const status = error.status || error.statusCode || 0;
            if (status === 404) {
                console.warn(`[News Service] Generation model ${modelName} not available. Trying next...`);
                continue;
            }
            break;
        }
    }

    console.warn("[News Service] Intelligence extraction failed for all models:", lastError);
    return {
        player_name: null,
        sentiment: 'NEUTRAL',
        category: 'Other',
        impact_backup: null,
        is_injury_report: false,
        injury_status: null,
        expected_return_date: null,
        impacted_player_ids: [],
        trust_level: 1
    };
};

const getEmbedding = async (text: string) => {
    if (!process.env.GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY is not configured for embeddings");
    }

    try {
        let lastError: unknown;
        console.log(`[News Service] Embedding candidates: ${embeddingModelCandidates.join(', ')}`);

        for (const modelName of embeddingModelCandidates) {
            try {
                console.log(`[News Service] Attempting embedding with model: ${modelName}`);
                const model = getEmbeddingModel(modelName);
                const result = await model.embedContent(text);

                if (result.embedding?.values) {
                    console.log(`[News Service] Embedding success with ${modelName}`);
                    return result.embedding.values;
                }
                throw new Error(`Empty embedding result from ${modelName}`);
            } catch (error: any) {
                lastError = error;
                console.log(`[News Service] Error from ${modelName}:`, {
                    status: error.status,
                    message: error.message
                });

                const status = error.status || error.statusCode || 0;
                const message = error.message || "";

                const isNotFound = status === 404 ||
                    message.includes("404") ||
                    message.toLowerCase().includes("not found") ||
                    message.toLowerCase().includes("unsupported");

                if (isNotFound) {
                    console.warn(`[News Service] Model ${modelName} not available (404/Not Found). Trying next...`);
                    continue;
                }

                console.error(`[News Service] Critical error with model ${modelName}:`, error);
                throw error;
            }
        }

        console.error("[News Service] All embedding models failed:", lastError);
        throw lastError;
    } catch (error) {
        throw error;
    }
};

const NBA_KEYWORDS = ['NBA', 'Basketball', 'Lakers', 'Warriors', 'Celtics', 'Knicks', 'Bucks', 'Suns', 'Mavs', 'Grizzlies', 'Sixers', '76ers', 'Nets', 'Heat', 'Bulls', 'Raptors', 'Nuggets', 'Clippers', 'Timberwolves', 'Wolves', 'Thunder', 'Kings', 'Pelicans', 'Hawks', 'Cavaliers', 'Cavs', 'Magic', 'Pacers', 'Pistons', 'Hornets', 'Spurs', 'Blazers', 'Jazz', 'Rockets', 'Wizards', 'All-Star', 'Playoffs', 'Draft'];

// --- Mapping Utilities ---
function mapEspnArticleToRssItem(article: any) {
    return {
        title: article.headline as string,
        link: (article.links?.web?.href || article.links?.api?.self?.href) as string,
        contentSnippet: article.description as string,
        content: article.description as string,
        isoDate: article.published as string
    };
}

// --- Processing Utilities ---
async function processItem(item: any, source: string, watchlist: string[], activeKeywords: string[]) {
    if (!item.title || !item.link) return false;

    // 1. Fast Keyword Check
    const combinedText = `${item.title} ${item.contentSnippet || ''}`.toLowerCase();
    const isNBA = activeKeywords.some(kw => combinedText.includes(kw.toLowerCase()));

    if (!isNBA && source !== 'Rotowire') {
        return false;
    }

    try {
        // 2. Check if exists
        const { data: existing } = await supabase
            .from('news_items')
            .select('id')
            .eq('url', item.link)
            .maybeSingle();

        if (existing) return false;

        console.log(`[News Service] Processing: ${item.title}`);

        // 3. Generate Intelligence & Embedding
        const contentText = item.contentSnippet || item.title;
        const [intelligence, embedding] = await Promise.all([
            extractIntelligence(contentText),
            getEmbedding(`${item.title} ${contentText}`)
        ]);

        // 4. Gatekeeper
        if (intelligence.category === 'Other' && !isNBA) {
            console.log(`[News Service] AI Rejected "Other" category: ${item.title}`);
            return false;
        }

        // 5. Insert
        const feed = FEEDS.find(f => f.source === source);
        const { error } = await supabase.from('news_items').insert({
            title: item.title,
            url: item.link,
            content: item.content || item.contentSnippet,
            summary: item.contentSnippet,
            published_at: item.isoDate || new Date().toISOString(),
            source: source,
            embedding: embedding,
            player_name: intelligence.player_name,
            sentiment: intelligence.sentiment,
            category: intelligence.category,
            impact_backup: intelligence.impact_backup,
            is_injury_report: intelligence.is_injury_report,
            injury_status: intelligence.injury_status,
            expected_return_date: intelligence.expected_return_date,
            impacted_player_ids: intelligence.impacted_player_ids,
            trust_level: feed?.trust_level || intelligence.trust_level
        });

        if (error) {
            console.error(`[News Service] Error inserting news:`, error);
            return false;
        }
        return true;
    } catch (err) {
        console.error(`[News Service] Unexpected error processing item:`, err);
        return false;
    }
}

export async function fetchAndIngestNews(watchlist: string[] = []) {
    let importedCount = 0;
    const MAX_ITEMS_PER_SYNC = 50; // Increased throughput for user request
    const activeKeywords = [...NBA_KEYWORDS, ...watchlist];

    console.log(`Starting High-Throughput NBA Ingestion... (Watchlist: ${watchlist.length} players)`);

    for (const feed of FEEDS) {
        if (importedCount >= MAX_ITEMS_PER_SYNC) break;

        try {
            console.log(`Fetching ${feed.source}...`);
            const parsed = await parser.parseURL(feed.url);

            // Look at slightly more items from each feed
            const itemsToProcess = parsed.items.slice(0, 40);

            // Process in batches of 5 for higher throughput
            for (let i = 0; i < itemsToProcess.length; i += 5) {
                if (importedCount >= MAX_ITEMS_PER_SYNC) break;

                const batch = itemsToProcess.slice(i, i + 5);
                const results = await Promise.all(
                    batch.map(item => processItem(item, feed.source, watchlist, activeKeywords))
                );

                importedCount += results.filter(Boolean).length;
            }

        } catch (err) {
            console.error(`Failed to parse feed ${feed.source}:`, err);
        }
    }

    console.log(`Ingestion complete. Imported ${importedCount} items.`);
    return importedCount;
}

export async function backfillNews(watchlist: string[] = [], pages: number = 3) {
    let importedCount = 0;
    const activeKeywords = [...NBA_KEYWORDS, ...watchlist];

    console.log(`[News Service] Starting Historical Backfill (${pages} pages)...`);

    for (let page = 1; page <= pages; page++) {
        const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=50&page=${page}`;
        console.log(`[News Service] Fetching ESPN API Page ${page}...`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`[News Service] ESPN API returned ${response.status} for page ${page}`);
                continue;
            }

            const data = await response.json();
            const articles = data.articles || [];

            console.log(`[News Service] Page ${page} contains ${articles.length} potential items`);

            // Process in batches to avoid overwhelming LLM/Embeddings
            for (let i = 0; i < articles.length; i += 5) {
                const batch = articles.slice(i, i + 5);
                const results = await Promise.all(
                    batch.map((article: any) => {
                        const item = mapEspnArticleToRssItem(article);
                        return processItem(item, 'ESPN', watchlist, activeKeywords);
                    })
                );
                importedCount += results.filter(Boolean).length;
            }
        } catch (err) {
            console.error(`[News Service] Error in backfill page ${page}:`, err);
        }
    }

    console.log(`[News Service] Backfill complete. Imported ${importedCount} items.`);
    return importedCount;
}

export async function searchNews(query: string, limit = 15) {
    if (!process.env.GOOGLE_API_KEY) {
        console.warn("GOOGLE_API_KEY missing, skipping news search");
        return [];
    }

    try {
        // 1. Embed Query
        const embedding = await getEmbedding(query);
        console.log(`Searching news with embedding (dim: ${embedding.length}) for: "${query.substring(0, 30)}..."`);

        // 2. Search via RPC (extended to 14 days for long-term injury tracking)
        const { data, error } = await supabase.rpc('match_news_documents', {
            query_embedding: embedding,
            match_threshold: 0.25, // Slightly lower threshold to be more inclusive
            match_count: limit,
            days_back: 14
        });

        if (error) {
            console.error("Supabase RPC match_news_documents error:", error);
            return [];
        }

        console.log(`RAG found ${data?.length || 0} relevant news items.`);
        return data || [];
    } catch (err) {
        console.error("Error in searchNews:", err);
        return [];
    }
}

export async function getLatestNews(limit = 20) {
    const { data, error } = await supabase
        .from('news_items')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Error fetching latest news:", error);
        return [];
    }
    return data;
}
