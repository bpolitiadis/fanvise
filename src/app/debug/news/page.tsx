import { getLatestNews } from "@/services/news.service";

interface DebugNewsItem {
    id: string;
    url: string;
    title: string;
    source: string;
    published_at: string;
    summary?: string | null;
    content?: string | null;
}

export default async function NewsDebugPage() {
    const news = await getLatestNews(50) as DebugNewsItem[];

    return (
        <div className="container mx-auto p-4 py-8">
            <h1 className="text-2xl font-bold mb-6">News Ingestion Debug</h1>
            
            <div className="grid gap-4">
                {news.map((item) => (
                    <div key={item.id} className="p-4 border rounded-lg shadow-sm bg-card">
                        <div className="flex justify-between items-start mb-2">
                            <h2 className="font-semibold text-lg hover:underline">
                                <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                            </h2>
                            <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                {item.source}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                            {new Date(item.published_at).toLocaleString()}
                        </p>
                        <p className="text-sm">
                            {item.summary || item.content}
                        </p>
                    </div>
                ))}

                {news.length === 0 && (
                    <div className="text-center p-8 text-muted-foreground">
                        No news items found. Run ingestion script.
                    </div>
                )}
            </div>
        </div>
    );
}
