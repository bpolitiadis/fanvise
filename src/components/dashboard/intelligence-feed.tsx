"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { NewsItem } from "@/types/dashboard";

interface IntelligenceFeedProps {
  news: NewsItem[];
  className?: string;
}

const formatPublishedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export function IntelligenceFeed({ news, className }: IntelligenceFeedProps) {
  return (
    <Card className={cn("border-border/50 shadow-lg bg-card/50 backdrop-blur-sm border-l-4 border-l-yellow-600 h-full flex flex-col", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="w-5 h-5 text-secondary" />
                Intelligence Feed
            </CardTitle>
            <Badge className="bg-secondary/10 text-secondary border-secondary/20">Live</Badge>
        </div>
        <CardDescription>Recent injuries & roster implications</CardDescription>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-[600px]">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {news && news.length > 0 ? news.map((item) => (
              <div key={item.id} className="relative pl-4 border-l-2 border-muted hover:border-secondary transition-colors group py-1">
                <div className="absolute -left-[5px] top-3 w-2 h-2 rounded-full bg-muted group-hover:bg-secondary transition-colors" />
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="block space-y-1">
                  <h4 className="font-bold text-sm leading-tight group-hover:text-secondary transition-colors line-clamp-2">
                    {item.title}
                  </h4>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.summary || item.content}
                  </p>
                  <div className="flex items-center gap-2 pt-1 uppercase tracking-tighter text-[9px] font-bold text-muted-foreground/60">
                    <span>{item.source}</span>
                    <span>•</span>
                    <span>{formatPublishedAt(item.published_at)}</span>
                  </div>
                </a>
              </div>
            )) : (
              <div className="text-center py-12">
                <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">Scanning for intel...</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
