import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

export async function searchNews(queryEmbedding: number[]) {
    const { data, error } = await supabase.rpc('match_news_embeddings', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 5
    });

    if (error) {
        console.error('Error searching news:', error);
        return [];
    }

    return data;
}
