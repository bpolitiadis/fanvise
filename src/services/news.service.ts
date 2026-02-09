import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js'; // Use direct client for service role
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

const parser = new Parser();

export interface IntelligenceObject {
    player_name: string | null;
    sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    category: 'Injury' | 'Trade' | 'Lineup' | 'Performance' | 'Other' | 'General';
    impact_backup: string | null;
}

// RSS Feeds
const FEEDS = [
    { source: 'ESPN', url: 'https://www.espn.com/espn/rss/nba/news' },
    { source: 'Rotowire', url: 'https://www.rotowire.com/rss/news.php?sport=NBA' },
    { source: 'Yahoo', url: 'https://sports.yahoo.com/nba/rss.xml' }
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
    let lastError: any;

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

                Snippet: "${text}"
            `;

            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            });

            return JSON.parse(result.response.text());
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
    return { player_name: null, sentiment: 'NEUTRAL', category: 'Other', impact_backup: null };
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

export async function fetchAndIngestNews() {
    let importedCount = 0;

    console.log("Starting News Ingestion...");

    for (const feed of FEEDS) {
        try {
            console.log(`Fetching ${feed.source}...`);
            const parsed = await parser.parseURL(feed.url);

            for (const item of parsed.items) {
                if (!item.title || !item.link) continue;

                // 1. Check if exists
                const { data: existing } = await supabase
                    .from('news_items')
                    .select('id')
                    .eq('url', item.link)
                    .single();

                if (existing) {
                    console.log(`[News Service] Skipping existing: ${item.title}`);
                    continue;
                }

                console.log(`[News Service] Processing: ${item.title}`);

                // 2. Generate Intelligence & Embedding
                const contentText = item.contentSnippet || item.title;
                const [intelligence, embedding] = await Promise.all([
                    extractIntelligence(contentText),
                    getEmbedding(`${item.title} ${contentText}`)
                ]);

                // 3. Insert
                const { error } = await supabase.from('news_items').insert({
                    title: item.title,
                    url: item.link,
                    content: item.content || item.contentSnippet,
                    summary: item.contentSnippet,
                    published_at: item.isoDate || new Date().toISOString(),
                    source: feed.source,
                    embedding: embedding,
                    player_name: intelligence.player_name,
                    sentiment: intelligence.sentiment,
                    category: intelligence.category,
                    impact_backup: intelligence.impact_backup
                });

                if (error) {
                    console.error(`[News Service] Error inserting news:`, error);
                } else {
                    console.log(`[News Service] Ingested: ${item.title}`);
                    importedCount++;
                }
            }
        } catch (err) {
            console.error(`Failed to parse feed ${feed.source}:`, err);
        }
    }

    console.log(`Ingestion complete. Imported ${importedCount} new items.`);
    return importedCount;
}

export async function searchNews(query: string, limit = 5) {
    if (!process.env.GOOGLE_API_KEY) {
        console.warn("GOOGLE_API_KEY missing, skipping news search");
        return [];
    }

    try {
        // 1. Embed Query
        const embedding = await getEmbedding(query);
        console.log(`Searching news with embedding (dim: ${embedding.length}) for: "${query.substring(0, 30)}..."`);

        // 2. Search via RPC (default to last 7 days)
        const { data, error } = await supabase.rpc('match_news_documents', {
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: limit,
            days_back: 7
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
