"use client";

import Link from "next/link";
import { Activity, ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export function ActivityFeed({ transactions, className }: ActivityFeedProps) {
  return (
    <Card className={cn("bg-card/30 border-border/50", className)}>
      <CardHeader className="pb-2 border-b bg-muted/20">
        <CardTitle className="text-sm flex items-center justify-between uppercase tracking-wider text-muted-foreground">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-secondary" />
            Recent Activity
          </div>
          <Link href="#" className="text-[10px] font-normal hover:text-primary transition-colors">View All</Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-0">
        <div className="overflow-hidden">
          <Table>
              <TableHeader className="bg-muted/10">
                  <TableRow className="hover:bg-transparent border-b border-white/5">
                      <TableHead className="w-[120px] text-[10px] uppercase tracking-tighter h-9 px-4 text-muted-foreground/70">Date & Time</TableHead>
                      <TableHead className="w-[80px] text-[10px] uppercase tracking-tighter h-9 text-muted-foreground/70">Type</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-tighter h-9 text-muted-foreground/70">Activity Detail</TableHead>
                      <TableHead className="text-right text-[10px] uppercase tracking-tighter h-9 px-4 text-muted-foreground/70">Action</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                  {transactions.slice(0, 10).map((tx) => {
                      let typeColor = "text-muted-foreground";
                      let typeBg = "bg-muted/10";
                      let label = tx.type;
                      
                      if (tx.type === 'FREEAGENT' || tx.type === 'ADD') {
                          typeColor = "text-primary";
                          typeBg = "bg-primary/10";
                          label = "ADD";
                      } else if (tx.type === 'WAIVER') {
                          typeColor = "text-secondary";
                          typeBg = "bg-secondary/10";
                          label = "WAIVER";
                      } else if (tx.type === 'TRADE') {
                          typeColor = "text-purple-400";
                          typeBg = "bg-purple-400/10";
                          label = "TRADE";
                      } else if (tx.type === 'DROP') {
                          typeColor = "text-destructive";
                          typeBg = "bg-destructive/10";
                          label = "DROP";
                      } else if (tx.type === 'ROSTER') {
                          typeColor = "text-muted-foreground/50";
                          typeBg = "bg-muted/5";
                          label = "ROSTER";
                          // If description already explains the move, we could hide this or keep it subtle
                      }

                      const txDate = new Date(tx.published_at);
                      const dateStr = txDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                      const timeStr = txDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });

                       // Extract team context from description if possible
                      // Handle formats like "Team Name: action" or "Team Name added Player Name"
                      const teamNameMatch = tx.description.match(/^([^:|]+)/);
                      let teamInitial = "T";
                      if (teamNameMatch) {
                          const name = teamNameMatch[1].trim();
                          // Skip "Unknown Team" for initials if possible
                          if (name === "Unknown Team") {
                              teamInitial = "?";
                          } else {
                              // Get first letter of each word up to 2 words
                              teamInitial = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
                          }
                      }

                      return (
                          <TableRow key={tx.id} className="group border-white/5 hover:bg-muted/20 transition-colors">
                              <TableCell className="py-3 px-4">
                                  <div className="flex flex-col">
                                      <span className="text-[11px] font-bold text-foreground">{dateStr}</span>
                                      <span className="text-[10px] text-muted-foreground font-medium">{timeStr}</span>
                                  </div>
                              </TableCell>
                              <TableCell className="py-3">
                                  <div className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase text-center w-fit", typeBg, typeColor)}>
                                      {label}
                                  </div>
                              </TableCell>
                              <TableCell className="py-3">
                                  <div className="flex items-center gap-3">
                                      <div className="w-6 h-6 rounded-full bg-muted/50 border border-white/5 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                          {teamInitial}
                                      </div>
                                      <span className="text-xs font-medium group-hover:text-primary transition-colors">
                                          {tx.description}
                                      </span>
                                  </div>
                              </TableCell>
                              <TableCell className="text-right py-3 px-4">
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] font-bold text-muted-foreground hover:text-primary hover:bg-primary/10 uppercase tracking-tight">
                                      Dashboard
                                  </Button>
                              </TableCell>
                          </TableRow>
                      );
                  })}
              </TableBody>
          </Table>
          
          {transactions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
               <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground/30">
                  <ArrowRightLeft className="w-6 h-6" />
               </div>
               <p className="text-xs text-muted-foreground">Pulse scan: No recent movements</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
