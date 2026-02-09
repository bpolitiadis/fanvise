import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js'; // Use direct client for service role
import { GoogleGenerativeAI } from "@google/generative-ai";

const parser = new Parser();

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
const embeddingModel = genAI.getGenerativeModel({
    model: process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004"
});

const getEmbedding = async (text: string) => {
    try {
        console.log(`[News Service] Embedding with model: ${embeddingModel.model}`);
        const result = await embeddingModel.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error("Gemini Embedding Error:", error);
        // Fallback or re-throw
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

                if (existing) continue; // Skip duplicates

                // 2. Generate Embedding
                const textToEmbed = `${item.title} ${item.contentSnippet || ''}`;
                const embedding = await getEmbedding(textToEmbed);

                // 3. Insert
                const { error } = await supabase.from('news_items').insert({
                    title: item.title,
                    url: item.link,
                    content: item.content || item.contentSnippet,
                    summary: item.contentSnippet,
                    published_at: item.isoDate || new Date().toISOString(),
                    source: feed.source,
                    embedding: embedding
                });

                if (error) {
                    console.error(`Error inserting news from ${feed.source}:`, error);
                } else {
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

        // 2. Search via RPC
        const { data, error } = await supabase.rpc('match_news_documents', {
            query_embedding: embedding,
            match_threshold: 0.3, // Lowered for better recall
            match_count: limit
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
