/**
 * FanVise News Service
 * 
 * Manages the Real-Time Intelligence pipeline (RAG).
 * Responsibilities:
 * 1. RSS Ingestion from multiple high-trust NBA sources.
 * 2. Automated Intelligence Extraction using AI (Injury status, impact, sentiment).
 * 3. Vector Embedding generation for semantic search.
 * 4. Deduplication and persistence to Supabase.
 * 
 * This service provides the "Current Events" context that prevents the AI 
 * from using stale information about player availability.
 * 
 * @module services/news
 */
import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js'; // Use direct client for service role
import { sleep } from '@/utils/retry';

const parser = new Parser();
const IS_VERCEL_PROD = process.env.VERCEL_ENV === 'production';
const AI_STEP_TIMEOUT_MS = IS_VERCEL_PROD ? 15000 : 30000;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

interface SearchNewsItem {
    id?: string;
    title?: string | null;
    url?: string | null;
    content?: string | null;
    summary?: string | null;
    full_content?: string | null;
    published_at?: string | null;
    source?: string | null;
    player_name?: string | null;
    sentiment?: string | null;
    category?: string | null;
    impact_backup?: string | null;
    is_injury_report?: boolean | null;
    injury_status?: string | null;
    expected_return_date?: string | null;
    impacted_player_ids?: string[] | null;
    trust_level?: number | null;
    similarity?: number | null;
}

export interface PlayerStatusSnapshotItem {
    player_id: number;
    player_name: string;
    injury_status: string | null;
    injury_type: string | null;
    expected_return_date: string | null;
    last_news_date: string | null;
    injured: boolean | null;
    source: string | null;
    last_synced_at: string | null;
}

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

const normalizeExpectedReturnDate = (value: string | null): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toISOString();
};

// RSS Feeds
// RSS Feeds with Trust Ranking
const FEEDS = [
    { source: 'ESPN', url: 'https://www.espn.com/espn/rss/nba/news', trust_level: 5 },
    { source: 'Rotowire', url: 'https://www.rotowire.com/rss/news.php?sport=NBA', trust_level: 4 },
    { source: 'Yahoo', url: 'https://sports.yahoo.com/nba/rss.xml', trust_level: 5 },
    { source: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/nba', trust_level: 4 },
    // Fox Sports returns 403 Forbidden, replaced with RealGM for better reliability
    { source: 'RealGM', url: 'https://basketball.realgm.com/rss/wiretap/0/0.xml', trust_level: 4 },
    // New Sources
    // { source: 'FantasyPros NBA', url: 'https://partners.fantasypros.com/api/v1/rss-feed.php?sport=NBA', trust_level: 4 }, // 404 Not Found
    // { source: 'Razzball', url: 'https://basketball.razzball.com/feed', trust_level: 3 }, // 403 Forbidden (Cloudflare)
    { source: 'SportsEthos', url: 'https://sportsethos.com/tag/fantasy-basketball/feed', trust_level: 3 },
    // Placeholder URL for Underdog NBA - User needs to replace this
    { source: 'Underdog NBA', url: 'https://rss.app/feeds/UNDERDOG_NBA_PLACEHOLDER.xml', trust_level: 4 }
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
        - injury_status: (string|null) OFS, GTD, OUT, Day-to-Day, Questionable, or SSPD (Suspended).
        - expected_return_date: (string|null) ISO format if mentioned.
        - impacted_player_ids: (string[]) List of player names affected.

        Snippet: "${text}"
    `;

    try {
        const { extractIntelligence: aiExtractIntelligence } = await import('./ai.service');
        const intelligence = await aiExtractIntelligence(prompt);
        const normalizeSentiment = (value: unknown): IntelligenceObject['sentiment'] => {
            if (value === 'POSITIVE' || value === 'NEGATIVE' || value === 'NEUTRAL') return value;
            return 'NEUTRAL';
        };
        const normalizeCategory = (value: unknown): IntelligenceObject['category'] => {
            if (
                value === 'Injury' || value === 'Trade' || value === 'Lineup' ||
                value === 'Performance' || value === 'Other' || value === 'General'
            ) {
                return value;
            }
            return 'Other';
        };

        return {
            player_name: typeof intelligence.player_name === 'string' ? intelligence.player_name : null,
            sentiment: normalizeSentiment(intelligence.sentiment),
            category: normalizeCategory(intelligence.category),
            impact_backup: typeof intelligence.impact_backup === 'string' ? intelligence.impact_backup : null,
            is_injury_report: Boolean(intelligence.is_injury_report),
            injury_status: typeof intelligence.injury_status === 'string' ? intelligence.injury_status : null,
            expected_return_date: typeof intelligence.expected_return_date === 'string' ? intelligence.expected_return_date : null,
            impacted_player_ids: Array.isArray(intelligence.impacted_player_ids)
                ? intelligence.impacted_player_ids.filter((id): id is string => typeof id === 'string')
                : [],
            trust_level: 1 // Default, overridden by feed
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[News Service] Intelligence extraction failed:", message);
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

const STATUS_KEYWORDS = ['out', 'gtd', 'day-to-day', 'questionable', 'injury', 'ruled out', 'available', 'minutes restriction', 'doubtful', 'ofs', 'sspd', 'suspended'];
const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'should', 'would', 'could',
    'about', 'into', 'your', 'my', 'our', 'you', 'are', 'who', 'tonight', 'today', 'week', 'news', 'player'
]);
const PLAYER_NOISE_TERMS = new Set([
    ...Array.from(STOP_WORDS),
    'nba', 'fantasy', 'basketball', 'latest', 'update', 'updates', 'report', 'reports',
    'status', 'timeline', 'return', 'returns', 'availability', 'injury', 'injuries',
    'dtd', 'gtd', 'out', 'questionable', 'doubtful', 'ofs', 'ruled', 'available', 'minutes', 'restriction', 'sspd', 'suspended'
]);

const toIsoDaysAgo = (days: number) => new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();

const sanitizeSearchTerm = (term: string) => term.replace(/[^a-zA-Z0-9\- ]/g, '').trim();

const normalizeForMatch = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

interface SearchIntent {
    isInjuryQuery: boolean;
    playerCandidates: string[];
    playerTokens: string[];
}

const extractPlayerCandidates = (query: string): string[] => {
    const normalized = query.replace(/[^a-zA-Z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    const capitalizedPhrases = normalized.match(/\b(?:[A-Z]{2,}|[A-Z][a-z]+)(?:\s+(?:[A-Z]{2,}|[A-Z][a-z]+)){1,2}\b/g) || [];
    const explicitCandidates = capitalizedPhrases
        .map(phrase => normalizeForMatch(phrase))
        .filter(phrase => {
            const tokens = phrase.split(' ').filter(Boolean);
            if (tokens.length < 2) return false;
            return tokens.some(token => !PLAYER_NOISE_TERMS.has(token));
        });

    const lowerTokens = normalized
        .toLowerCase()
        .split(/\s+/)
        .map(sanitizeSearchTerm)
        .filter(Boolean);
    const meaningfulTokens = lowerTokens.filter(token => token.length >= 2 && !PLAYER_NOISE_TERMS.has(token));
    const fallbackCandidate = meaningfulTokens.length >= 2 ? [`${meaningfulTokens[0]} ${meaningfulTokens[1]}`] : [];

    return Array.from(new Set([...explicitCandidates, ...fallbackCandidate])).slice(0, 3);
};

const getSearchIntent = (query: string): SearchIntent => {
    const normalized = query.toLowerCase();
    const isInjuryQuery = STATUS_KEYWORDS.some(status => normalized.includes(status))
        || normalized.includes('injur')
        || normalized.includes('availability');
    const playerCandidates = extractPlayerCandidates(query);
    const playerTokens = Array.from(new Set(
        playerCandidates
            .flatMap(candidate => candidate.split(' ').filter(Boolean))
            .filter(token => token.length >= 2 && !PLAYER_NOISE_TERMS.has(token))
    ));

    return { isInjuryQuery, playerCandidates, playerTokens };
};

const getQueryTerms = (query: string): string[] => {
    const normalized = query.toLowerCase();
    const baseTerms = normalized
        .split(/\s+/)
        .map(sanitizeSearchTerm)
        .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
    const statusTerms = STATUS_KEYWORDS.filter(status => normalized.includes(status));
    return Array.from(new Set([...statusTerms, ...baseTerms])).slice(0, 8);
};

const textHitScore = (text: string, terms: string[]) => {
    if (!text || terms.length === 0) return 0;
    const normalized = text.toLowerCase();
    const hits = terms.reduce((count, term) => (normalized.includes(term) ? count + 1 : count), 0);
    return hits / terms.length;
};

const getPlayerMatchScore = (item: SearchNewsItem, intent: SearchIntent) => {
    if (intent.playerCandidates.length === 0) return 0;
    const searchableText = normalizeForMatch(`${item.player_name || ''} ${item.title || ''} ${item.summary || ''} ${item.content || ''}`);
    if (!searchableText) return 0;

    const exactPhraseHit = intent.playerCandidates.some(candidate => searchableText.includes(candidate));
    if (exactPhraseHit) return 1;

    if (intent.playerTokens.length === 0) return 0;
    const tokenHits = intent.playerTokens.reduce((count, token) => (searchableText.includes(token) ? count + 1 : count), 0);
    return tokenHits / intent.playerTokens.length;
};

const computeHybridScore = (item: SearchNewsItem, terms: string[], intent: SearchIntent) => {
    const now = Date.now();
    const publishedAt = item.published_at ? new Date(item.published_at).getTime() : now;
    const ageHours = Math.max(0, (now - publishedAt) / (1000 * 60 * 60));
    const recencyScore = Math.max(0, 1 - (ageHours / (24 * 7))); // 0 after ~7 days
    const trustScore = Math.min(1, Math.max(0, (item.trust_level || 1) / 5));
    const vectorScore = Math.max(0, Math.min(1, item.similarity || 0));
    const bodyText = (item.full_content || item.content || item.summary || "").substring(0, 800);
    const keywordText = `${item.title || ''} ${item.summary || ''} ${bodyText} ${item.player_name || ''} ${item.injury_status || ''}`;
    const keywordScore = textHitScore(keywordText, terms);
    const playerScore = getPlayerMatchScore(item, intent);

    let score = (vectorScore * 0.5) + (keywordScore * 0.2) + (playerScore * 0.2) + (recencyScore * 0.07) + (trustScore * 0.03);

    if (intent.isInjuryQuery && intent.playerCandidates.length > 0) {
        if (playerScore === 0) {
            score *= 0.2; // Strongly down-rank player-irrelevant injury matches.
        }
        if (item.is_injury_report && item.injury_status) {
            score = Math.min(1, score + 0.08);
        }
    }

    return score;
};

const normalizeSearchRow = (row: unknown): SearchNewsItem => {
    if (!row || typeof row !== 'object') return {};
    return row as SearchNewsItem;
};

const normalizePlayerStatusRow = (row: unknown): PlayerStatusSnapshotItem | null => {
    if (!row || typeof row !== "object") return null;
    const record = row as Record<string, unknown>;

    const playerId = record.player_id;
    const playerName = record.player_name;
    if (typeof playerId !== "number" || typeof playerName !== "string") return null;

    return {
        player_id: playerId,
        player_name: playerName,
        injury_status: typeof record.injury_status === "string" ? record.injury_status : null,
        injury_type: typeof record.injury_type === "string" ? record.injury_type : null,
        expected_return_date: typeof record.expected_return_date === "string" ? record.expected_return_date : null,
        last_news_date: typeof record.last_news_date === "string" ? record.last_news_date : null,
        injured: typeof record.injured === "boolean" ? record.injured : null,
        source: typeof record.source === "string" ? record.source : null,
        last_synced_at: typeof record.last_synced_at === "string" ? record.last_synced_at : null,
    };
};

interface RssIngestItem {
    title?: string;
    link?: string;
    contentSnippet?: string;
    content?: string;
    isoDate?: string;
    guid?: string;
    /** ESPN API URL for full article fetch (backfill only) */
    espnApiUrl?: string;
}

/** Extract ESPN article ID from ESPN URLs (web, mobile, api) */
const ESPN_ID_REGEX = /[?&](?:id|storyId)=(\d+)|(?:\/_\/id\/)(\d+)|(?:\/news\/)(\d+)/i;

function extractEspnArticleId(url: string): string | null {
    if (!url || !url.includes('espn')) return null;
    const m = url.match(ESPN_ID_REGEX);
    return m ? (m[1] || m[2] || m[3] || null) : null;
}

/** Fetch full article text from ESPN content API. Returns null on failure. */
async function fetchEspnFullArticle(apiUrlOrId: string): Promise<string | null> {
    let apiUrl: string;
    if (/^\d+$/.test(apiUrlOrId)) {
        apiUrl = `https://content.core.api.espn.com/v1/sports/news/${apiUrlOrId}`;
    } else {
        apiUrl = apiUrlOrId;
    }
    if (!apiUrl.includes('content.core.api.espn.com')) return null;

    try {
        const res = await fetch(apiUrl, { next: { revalidate: 0 } });
        if (!res.ok) return null;
        const data = (await res.json()) as { headlines?: Array<{ story?: string }> };
        const story = data?.headlines?.[0]?.story;
        if (!story || typeof story !== 'string') return null;
        return cleanContent(story).trim() || null;
    } catch {
        return null;
    }
}

// --- Mapping Utilities ---
function mapEspnArticleToRssItem(article: Record<string, unknown>): RssIngestItem {
    const links = article.links as { web?: { href?: string }; api?: { self?: { href?: string } } } | undefined;
    const apiHref = links?.api?.self?.href;
    const webHref = links?.web?.href;
    return {
        title: article.headline as string,
        link: webHref || apiHref,
        contentSnippet: article.description as string,
        content: article.description as string,
        isoDate: article.published as string,
        espnApiUrl: apiHref && apiHref.includes('/news/') ? apiHref : undefined,
    };
}

// --- Processing Utilities ---
async function processItem(item: RssIngestItem, source: string, watchlist: string[], activeKeywords: string[], dryRun: boolean = false) {
    if (!item.title || !item.link) return false;

    // 1. Fast Keyword Check
    const combinedText = `${item.title} ${item.contentSnippet || ''}`.toLowerCase();
    const isNBA = activeKeywords.some(kw => combinedText.includes(kw.toLowerCase()));

    if (!isNBA && source !== 'Rotowire') {
        return false;
    }

    try {
        // 2. Check if exists (by URL or GUID)
        let query = supabase.from('news_items').select('id');

        if (item.guid) {
            // If GUID exists, check matches on EITHER url OR guid
            query = query.or(`url.eq.${item.link},guid.eq.${item.guid}`);
        } else {
            // Fallback to just URL
            query = query.eq('url', item.link);
        }

        const { data: existing } = await query.maybeSingle();

        if (existing) return false;

        console.log(`[News Service] Processing: ${item.title}`);

        // 3. Generate Intelligence & Embedding
        if (dryRun) {
            console.log(`[News Service] DRY RUN: Skipping AI extraction and DB insert for: ${item.title}`);
            return true;
        }

        // 3a. Fetch full ESPN article when available (API or extracted ID from URL)
        let fullContent: string | null = null;
        if (source === 'ESPN') {
            const apiUrl = item.espnApiUrl;
            const articleId = apiUrl ? null : (item.link ? extractEspnArticleId(item.link) : null);
            const fetchTarget = apiUrl ?? (articleId ? `https://content.core.api.espn.com/v1/sports/news/${articleId}` : null);
            if (fetchTarget) {
                fullContent = await withTimeout(
                    fetchEspnFullArticle(fetchTarget),
                    8000,
                    "ESPN full article fetch"
                ).catch(() => null);
            }
        }

        const snippetText = cleanContent(item.contentSnippet || item.title || "");
        const contentText = fullContent || snippetText;
        const intelligencePromise = withTimeout(
            extractIntelligence(contentText),
            AI_STEP_TIMEOUT_MS,
            "intelligence extraction"
        ).catch((intelligenceError: unknown) => {
            const message = intelligenceError instanceof Error ? intelligenceError.message : String(intelligenceError);
            console.warn(`[News Service] Intelligence extraction timed out/fail, using fallback: ${message}`);
            return {
                player_name: null,
                sentiment: 'NEUTRAL' as const,
                category: 'Other' as const,
                impact_backup: null,
                is_injury_report: false,
                injury_status: null,
                expected_return_date: null,
                impacted_player_ids: [],
                trust_level: 1,
            };
        });
        const embedSource = contentText.length > 600 ? `${item.title} ${contentText.substring(0, 600)}` : `${item.title} ${contentText}`;
        const embeddingPromise = withTimeout(
            getEmbedding(embedSource),
            AI_STEP_TIMEOUT_MS,
            "embedding generation"
        )
            .catch((embeddingError: unknown) => {
                const message = embeddingError instanceof Error ? embeddingError.message : String(embeddingError);
                console.warn(`[News Service] Embedding generation failed, continuing without vector: ${message}`);
                return null;
            });
        const [intelligence, embedding] = await Promise.all([intelligencePromise, embeddingPromise]);

        // 4. Gatekeeper - Disabled as AI does not return trust_level currently
        // if (intelligence.trust_level < (FEEDS.find(f => f.source === source)?.trust_level || 1)) {
        //     return false;
        // }

        // 5. Store
        const { error } = await supabase.from('news_items').insert({
            title: item.title,
            url: item.link,
            content: cleanContent(item.content || item.contentSnippet || ""),
            summary: cleanContent(item.contentSnippet || ""),
            full_content: fullContent ? cleanContent(fullContent) : null,
            published_at: item.isoDate || new Date().toISOString(),
            source: source,
            embedding: embedding,
            player_name: intelligence.player_name,
            sentiment: intelligence.sentiment,
            category: intelligence.category,
            impact_backup: intelligence.impact_backup,
            is_injury_report: intelligence.is_injury_report,
            injury_status: intelligence.injury_status,
            expected_return_date: normalizeExpectedReturnDate(intelligence.expected_return_date),
            impacted_player_ids: intelligence.impacted_player_ids,
            trust_level: (FEEDS.find(f => f.source === source)?.trust_level || intelligence.trust_level),
            guid: item.guid || null
        });

        if (error) {
            if (error.code === '23505') {
                console.log(`[News Service] Item already exists (skipping duplicate): ${item.title}`);
                return true;
            }
            console.error(`[News Service] Error inserting news:`, error);
            return false;
        }
        return true;
    } catch (err) {
        console.error(`[News Service] Unexpected error processing item:`, err);
        return false;
    }
}

export async function fetchAndIngestNews(watchlist: string[] = [], limit: number = 50, dryRun: boolean = false) {
    let importedCount = 0;
    const MAX_ITEMS_PER_SYNC = limit; // Increased throughput for user request
    const activeKeywords = [...NBA_KEYWORDS, ...watchlist];
    const defaultBatchSize = IS_VERCEL_PROD ? 1 : 2;
    const configuredBatchSize = Number(process.env.NEWS_INGEST_BATCH_SIZE || defaultBatchSize);
    const batchSize = Number.isFinite(configuredBatchSize)
        ? Math.max(1, Math.min(Math.floor(configuredBatchSize), 3))
        : defaultBatchSize;
    const defaultDelayMs = IS_VERCEL_PROD ? 2500 : 1000;
    const configuredDelayMs = Number(process.env.NEWS_INGEST_DELAY_MS || defaultDelayMs);
    const delayMs = Number.isFinite(configuredDelayMs)
        ? Math.max(500, Math.min(Math.floor(configuredDelayMs), 10000))
        : defaultDelayMs;

    console.log(`Starting NBA ingestion... (Watchlist: ${watchlist.length}, batchSize=${batchSize}, delayMs=${delayMs})`);

    for (const feed of FEEDS) {
        if (importedCount >= MAX_ITEMS_PER_SYNC) break;

        try {
            console.log(`Fetching ${feed.source}...`);
            const parsed = await parser.parseURL(feed.url);

            // Look at slightly more items from each feed
            const itemsToProcess = parsed.items.slice(0, 40);

            // Process with adaptive batch size to reduce provider 429s in production.
            for (let i = 0; i < itemsToProcess.length; i += batchSize) {
                if (importedCount >= MAX_ITEMS_PER_SYNC) break;

                const batch = itemsToProcess.slice(i, i + batchSize);
                const results = await Promise.all(
                    batch.map(item => processItem(item, feed.source, watchlist, activeKeywords, dryRun))
                );

                importedCount += results.filter(Boolean).length;

                if (batch.length > 0 && !dryRun) await sleep(delayMs);
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
                    batch.map((article: unknown) => {
                        if (!article || typeof article !== 'object') return false;
                        const item = mapEspnArticleToRssItem(article as Record<string, unknown>);
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
        const searchIntent = getSearchIntent(query);

        // 1. Embed query for vector retrieval
        const embedding = await getEmbedding(query);
        console.log(`Searching news with embedding (dim: ${embedding.length}) for: "${query.substring(0, 30)}..."`);

        // 2. Vector retrieval via RPC (Adaptive window: 30 days for injury, 14 days for general)
        const daysBack = searchIntent.isInjuryQuery ? 30 : 14;

        const { data: vectorData, error: vectorError } = await supabase.rpc('match_news_documents', {
            query_embedding: embedding,
            match_threshold: 0.25, // Slightly lower threshold to be more inclusive
            match_count: Math.max(limit * 2, 20),
            days_back: daysBack
        });

        if (vectorError) {
            console.error("Supabase RPC match_news_documents error:", vectorError);
        }

        // 3. Lightweight lexical retrieval fallback (hybrid behavior without DB migration)
        const terms = getQueryTerms(query);
        const lexicalTerms = Array.from(new Set([...terms, ...searchIntent.playerTokens]));
        const cutoff = toIsoDaysAgo(daysBack);
        let lexicalRows: SearchNewsItem[] = [];

        if (lexicalTerms.length > 0) {
            const orClauses: string[] = [];
            for (const term of lexicalTerms) {
                if (!term) continue;
                orClauses.push(`title.ilike.%${term}%`);
                orClauses.push(`summary.ilike.%${term}%`);
                orClauses.push(`content.ilike.%${term}%`);
                orClauses.push(`player_name.ilike.%${term}%`);
                orClauses.push(`injury_status.ilike.%${term}%`);
            }
            for (const candidate of searchIntent.playerCandidates) {
                if (!candidate) continue;
                orClauses.push(`title.ilike.%${candidate}%`);
                orClauses.push(`summary.ilike.%${candidate}%`);
                orClauses.push(`content.ilike.%${candidate}%`);
                orClauses.push(`player_name.ilike.%${candidate}%`);
            }

            if (orClauses.length > 0) {
                const { data: lexicalData, error: lexicalError } = await supabase
                    .from('news_items')
                    .select('id,title,url,content,summary,full_content,published_at,source,player_name,sentiment,category,impact_backup,is_injury_report,injury_status,expected_return_date,impacted_player_ids,trust_level')
                    .gt('published_at', cutoff)
                    .or(orClauses.join(','))
                    .order('published_at', { ascending: false })
                    .limit(Math.max(limit * 3, 24));

                if (lexicalError) {
                    console.error("Supabase lexical news search error:", lexicalError);
                } else {
                    lexicalRows = (lexicalData || []).map(normalizeSearchRow);
                }
            }
        }

        const vectorRows = (vectorData || []).map(normalizeSearchRow);
        const merged = new Map<string, SearchNewsItem>();

        for (const item of [...vectorRows, ...lexicalRows]) {
            const key = item.id || item.url || `${item.title}-${item.published_at}`;
            if (!key) continue;
            const existing = merged.get(key);
            if (!existing) {
                merged.set(key, item);
                continue;
            }
            merged.set(key, {
                ...existing,
                ...item,
                similarity: Math.max(existing.similarity || 0, item.similarity || 0),
            });
        }

        let rankedEntries = Array.from(merged.values())
            .map(item => ({ item, score: computeHybridScore(item, terms, searchIntent) }))
            .sort((a, b) => b.score - a.score);

        if (searchIntent.isInjuryQuery && searchIntent.playerCandidates.length > 0) {
            const playerAligned = rankedEntries.filter(entry => getPlayerMatchScore(entry.item, searchIntent) >= 0.5);
            if (playerAligned.length > 0) {
                rankedEntries = playerAligned;
            } else {
                rankedEntries = [];
            }
        }

        let ranked = rankedEntries.slice(0, limit).map(({ item }) => item);

        // TODO: Filter by user's enabled news sources when userId is available (Phase 3)

        console.log(`Hybrid RAG found ${ranked.length} items (vector=${vectorRows.length}, lexical=${lexicalRows.length}).`);
        return ranked;
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

export async function searchPlayerStatusSnapshots(query: string, limit = 5): Promise<PlayerStatusSnapshotItem[]> {
    const searchIntent = getSearchIntent(query);
    const terms = getQueryTerms(query);
    const lexicalTerms = Array.from(new Set([...terms, ...searchIntent.playerTokens]));

    const orClauses: string[] = [];
    for (const term of lexicalTerms) {
        if (!term) continue;
        orClauses.push(`player_name.ilike.%${term}%`);
        orClauses.push(`injury_status.ilike.%${term}%`);
        orClauses.push(`injury_type.ilike.%${term}%`);
    }
    for (const candidate of searchIntent.playerCandidates) {
        if (!candidate) continue;
        orClauses.push(`player_name.ilike.%${candidate}%`);
    }

    let queryBuilder = supabase
        .from("player_status_snapshots")
        .select("player_id,player_name,injury_status,injury_type,expected_return_date,last_news_date,injured,source,last_synced_at")
        .order("last_news_date", { ascending: false, nullsFirst: false })
        .order("last_synced_at", { ascending: false })
        .limit(Math.max(1, Math.min(Math.floor(limit), 10)));

    if (orClauses.length > 0) {
        queryBuilder = queryBuilder.or(orClauses.join(","));
    }

    const { data, error } = await queryBuilder;
    if (error) {
        console.error("Supabase player status search error:", error);
        return [];
    }

    const normalized = (data || [])
        .map(normalizePlayerStatusRow)
        .filter((item): item is PlayerStatusSnapshotItem => item !== null);

    if (searchIntent.isInjuryQuery && searchIntent.playerCandidates.length > 0) {
        const filtered = normalized.filter(item => {
            const candidate = normalizeForMatch(item.player_name || "");
            return searchIntent.playerCandidates.some(player => candidate.includes(player));
        });
        return filtered.slice(0, limit);
    }

    return normalized.slice(0, limit);
}

// ─── Live Player-Specific News Fetch ─────────────────────────────────────────

export interface FreshNewsResult {
    /** How many new articles were ingested into the DB during this call */
    refreshed: number;
    /** The latest news items for this player (fresh + existing), ranked by relevance */
    items: SearchNewsItem[];
}

/**
 * Fetches all configured RSS feeds in parallel, filters for articles that
 * mention the given player, ingests any new items into `news_items`, then
 * returns a fresh DB snapshot for the player.
 *
 * Designed to be called by the `refresh_player_news` agent tool when the
 * standard `get_player_news` search returned stale or empty results.
 */
export async function fetchPlayerSpecificNews(
    playerName: string,
    options: { feedTimeoutMs?: number } = {}
): Promise<FreshNewsResult> {
    const feedTimeoutMs = options.feedTimeoutMs ?? 5_000;

    // Tokens used for quick title/content matching (e.g. "lebron james" → ["lebron", "james"])
    const playerTokens = normalizeForMatch(playerName)
        .split(/\s+/)
        .filter(t => t.length >= 2);

    if (playerTokens.length === 0) {
        return { refreshed: 0, items: [] };
    }

    const matchesPlayer = (text: string): boolean => {
        const norm = normalizeForMatch(text);
        // Require ALL tokens to be present (avoids false positives on common words)
        return playerTokens.every(token => norm.includes(token));
    };

    // --- 1. Fetch all feeds in parallel with per-feed timeout ---
    const fetchFeed = async (feed: { source: string; url: string }): Promise<RssIngestItem[]> => {
        try {
            const parsed = await Promise.race([
                parser.parseURL(feed.url),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Feed ${feed.source} timed out`)), feedTimeoutMs)
                ),
            ]);
            return (parsed.items || []) as RssIngestItem[];
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[News Service] fetchPlayerSpecificNews: feed ${feed.source} skipped — ${msg}`);
            return [];
        }
    };

    const allFeedResults = await Promise.all(FEEDS.map(feed => fetchFeed(feed).then(items => ({ feed, items }))));

    // --- 2. Collect only items that mention the player ---
    const seen = new Set<string>();
    const candidates: Array<{ item: RssIngestItem; source: string; trustLevel: number }> = [];

    for (const { feed, items } of allFeedResults) {
        for (const item of items) {
            const combinedText = `${item.title ?? ""} ${item.contentSnippet ?? ""} ${item.content ?? ""}`;
            if (!matchesPlayer(combinedText)) continue;

            const dedupeKey = item.guid || item.link;
            if (!dedupeKey || seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            candidates.push({
                item,
                source: feed.source,
                trustLevel: FEEDS.find(f => f.source === feed.source)?.trust_level ?? 3,
            });
        }
    }

    console.log(
        `[News Service] fetchPlayerSpecificNews("${playerName}"): found ${candidates.length} matching article(s) across feeds`
    );

    // --- 3. Ingest each candidate (deduplication inside processItem) ---
    let refreshed = 0;
    // Process in small batches to stay within AI rate limits
    const batchSize = 2;
    for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(({ item, source }) =>
                processItem(item, source, [playerName], [...NBA_KEYWORDS, playerName], false)
            )
        );
        refreshed += results.filter(Boolean).length;
        if (batch.length > 0 && i + batchSize < candidates.length) {
            await sleep(500);
        }
    }

    // --- 4. Return a fresh DB snapshot for the agent ---
    const searchQuery = `${playerName} injury status news update latest`;
    const items = await searchNews(searchQuery, 10);

    return { refreshed, items };
}
