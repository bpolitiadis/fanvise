import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js'; // Use direct client for service role
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { withRetry, sleep } from '@/utils/retry';

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

const extractIntelligence = async (text: string): Promise<IntelligenceObject> => {
    const prompt = `
        Analyze the following NBA news snippet and return a JSON object with:
        - player_name: (string|null) Primary player mentioned.
        - sentiment: (POSITIVE|NEGATIVE|NEUTRAL)
        - category: (Injury|Trade|Lineup|Performance|Other|General)
        - impact_backup: (string|null) The name of the teammate who gains fantasy value due to this news.
        - is_injury_report: (boolean) Is this primarily an injury update?
        - injury_status: (string|null) OFS, GTD, OUT, Day-to-Day, or Questionable.
        - expected_return_date: (string|null) ISO format if mentioned.
        - impacted_player_ids: (string[]) List of player names affected.

        Snippet: "${text}"
    `;

    try {
        const { extractIntelligence: aiExtractIntelligence } = await import('./ai.service');
        const intelligence = await aiExtractIntelligence(prompt);
        return {
            ...intelligence,
            trust_level: 1 // Default, overridden by feed
        };
    } catch (error: any) {
        console.warn("[News Service] Intelligence extraction failed:", error.message);
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
    }
};

const getEmbedding = async (text: string) => {
    const { getEmbedding: aiGetEmbedding } = await import('./ai.service');
    return aiGetEmbedding(text);
};

const cleanContent = (text: string): string => {
    if (!text) return text;
    return text
        .replace(/Visit RotoWire\.com for more [^.]+?\./gi, '')
        .replace(/For more fantasy basketball [^.]+?\./gi, '')
        .replace(/RotoWire\.com/gi, 'RotoWire')
        .replace(/\s+/g, ' ')
        .trim();
};

const NBA_KEYWORDS = [
    'NBA', 'Basketball', 'Lakers', 'Warriors', 'Celtics', 'Knicks', 'Bucks', 'Suns', 'Mavs', 'Grizzlies', 'Sixers', '76ers', 'Nets', 'Heat', 'Bulls', 'Raptors', 'Nuggets', 'Clippers', 'Timberwolves', 'Wolves', 'Thunder', 'Kings', 'Pelicans', 'Hawks', 'Cavaliers', 'Cavs', 'Magic', 'Pacers', 'Pistons', 'Hornets', 'Spurs', 'Blazers', 'Jazz', 'Rockets', 'Wizards', 'All-Star', 'Playoffs', 'Draft',
    // Adding top players and common basketball terms for better fallback matching
    'Jokic', 'Embiid', 'Antetokounmpo', 'Giannis', 'Doncic', 'Curry', 'LeBron', 'Durant', 'Tatum', 'Gilgeous-Alexander', 'SGA', 'Wembanyama', 'Wemby', 'Haliburton', 'Edwards', 'Brunson', 'Sabonis', 'Fox', 'Adebayo', 'Banchero',
    'Triple-double', 'Double-double', 'Free agent', 'Trade deadline', 'Injury report', 'GTD', 'Out indefinitely', 'Hardship exception', 'Two-way contract'
];

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
        const contentText = cleanContent(item.contentSnippet || item.title || "");
        const [intelligence, embedding] = await Promise.all([
            extractIntelligence(contentText),
            getEmbedding(`${item.title} ${contentText}`)
        ]);

        // 4. Gatekeeper
        if (intelligence.trust_level < (FEEDS.find(f => f.source === source)?.trust_level || 1)) {
            return false;
        }

        // 5. Store
        const { error } = await supabase.from('news_items').insert({
            title: item.title,
            url: item.link,
            content: cleanContent(item.content || item.contentSnippet || ""),
            summary: cleanContent(item.contentSnippet || ""),
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
            trust_level: (FEEDS.find(f => f.source === source)?.trust_level || intelligence.trust_level)
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

            // Process in batches of 2 for higher stability with rate limits
            for (let i = 0; i < itemsToProcess.length; i += 2) {
                if (importedCount >= MAX_ITEMS_PER_SYNC) break;

                const batch = itemsToProcess.slice(i, i + 2);
                const results = await Promise.all(
                    batch.map(item => processItem(item, feed.source, watchlist, activeKeywords))
                );

                importedCount += results.filter(Boolean).length;

                // Increased sleep between batches for better Free Tier compliance
                if (batch.length > 0) await sleep(1000);
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

            // Process in batches of 2
            for (let i = 0; i < articles.length; i += 2) {
                const batch = articles.slice(i, i + 2);
                const results = await Promise.all(
                    batch.map((article: any) => {
                        const item = mapEspnArticleToRssItem(article);
                        return processItem(item, 'ESPN', watchlist, activeKeywords);
                    })
                );
                importedCount += results.filter(Boolean).length;
                await sleep(1000);
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
