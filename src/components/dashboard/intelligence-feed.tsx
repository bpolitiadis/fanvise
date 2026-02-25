"use client";

import { Zap, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const sentimentDot = (item: NewsItem) => {
  if (item.is_injury_report || item.injury_status) return "bg-destructive";
  if (item.sentiment === "POSITIVE") return "bg-primary";
  return "bg-muted-foreground/40";
};

export function IntelligenceFeed({ news, className }: IntelligenceFeedProps) {
  return (
    <Card className={cn("bg-card/50 border-border/50 shadow-sm", className)}>
      <CardHeader className="pt-4 pb-3 px-4 border-b border-border/50 bg-muted/20">
        <CardTitle className="text-xs flex items-center justify-between uppercase tracking-widest font-semibold text-muted-foreground">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary" />
            Intelligence Feed
          </div>
          <Badge
            variant="outline"
            className="h-4 px-1.5 text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/20"
          >
            Live
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[640px]">
          <div className="divide-y divide-border/40">
            {news && news.length > 0 ? (
              news.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  {/* Status dot */}
                  <div className="shrink-0 mt-1.5">
                    <span
                      className={cn(
                        "block w-1.5 h-1.5 rounded-full mt-0.5 transition-colors group-hover:scale-125",
                        sentimentDot(item)
                      )}
                    />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[13px] font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {item.title}
                    </p>
                    {(item.summary || item.content) && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {item.summary || item.content}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 pt-0.5 uppercase tracking-widest text-[9px] font-bold text-muted-foreground/50">
                      <span>{item.source}</span>
                      <span>·</span>
                      <span>{formatPublishedAt(item.published_at)}</span>
                    </div>
                  </div>
                </a>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground/30" />
                </div>
                <p className="text-xs text-muted-foreground">Scanning for intel…</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
