"use client";

import Link from "next/link";
import { Activity, ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TransactionItem } from "@/types/dashboard";

interface ActivityFeedProps {
  transactions: TransactionItem[];
  className?: string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  FREEAGENT: { label: "ADD",    color: "text-primary",           bg: "bg-primary/10" },
  ADD:        { label: "ADD",    color: "text-primary",           bg: "bg-primary/10" },
  WAIVER:     { label: "WAIVER", color: "text-secondary",         bg: "bg-secondary/10" },
  TRADE:      { label: "TRADE",  color: "text-violet-400",        bg: "bg-violet-400/10" },
  DROP:       { label: "DROP",   color: "text-destructive",       bg: "bg-destructive/10" },
  ROSTER:     { label: "ROSTER", color: "text-muted-foreground/50", bg: "bg-muted/5" },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { label: type, color: "text-muted-foreground", bg: "bg-muted/10" };
}

function getTeamInitial(description: string): string {
  const match = description.match(/^([^:|]+)/);
  if (!match) return "T";
  const name = match[1].trim();
  if (name === "Unknown Team") return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

export function ActivityFeed({ transactions, className }: ActivityFeedProps) {
  return (
    <Card className={cn("bg-card/50 border-border/50 shadow-sm", className)}>
      <CardHeader className="pt-4 pb-3 px-4 border-b border-border/50 bg-muted/20">
        <CardTitle className="text-xs flex items-center justify-between uppercase tracking-widest font-semibold text-muted-foreground">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-primary" />
            Recent Activity
          </div>
          <Link
            href="#"
            className="text-[9px] font-bold lowercase tracking-wider text-muted-foreground/50 hover:text-primary transition-colors"
          >
            View All
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow className="hover:bg-transparent border-b border-border/40">
                <TableHead className="w-[110px] text-[10px] uppercase tracking-widest h-8 px-4 text-muted-foreground/60 font-semibold">
                  Date
                </TableHead>
                <TableHead className="w-[72px] text-[10px] uppercase tracking-widest h-8 text-muted-foreground/60 font-semibold">
                  Type
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest h-8 text-muted-foreground/60 font-semibold">
                  Detail
                </TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-widest h-8 px-4 text-muted-foreground/60 font-semibold">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.slice(0, 10).map((tx) => {
                const { label, color, bg } = getTypeConfig(tx.type);
                const txDate = new Date(tx.published_at);
                const dateStr = txDate.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                });
                const timeStr = txDate.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                });
                const teamInitial = getTeamInitial(tx.description);

                return (
                  <TableRow
                    key={tx.id}
                    className="group border-border/40 hover:bg-muted/20 transition-colors"
                  >
                    <TableCell className="py-2.5 px-4">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-foreground">{dateStr}</span>
                        <span className="text-[10px] text-muted-foreground/60">{timeStr}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <span
                        className={cn(
                          "inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                          bg,
                          color
                        )}
                      >
                        {label}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-muted/50 border border-border/60 shrink-0 flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                          {teamInitial}
                        </span>
                        <span className="text-[12px] font-medium text-foreground group-hover:text-primary transition-colors">
                          {tx.description}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-2.5 px-4">
                      <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider group-hover:text-primary transition-colors cursor-pointer">
                        Dashboard
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {transactions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center">
                <ArrowRightLeft className="w-5 h-5 text-muted-foreground/30" />
              </div>
              <p className="text-xs text-muted-foreground">No recent activity</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
