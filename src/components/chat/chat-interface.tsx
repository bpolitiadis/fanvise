"use client";

import { useState, useRef, useEffect } from "react";
import { MessageBubble } from "./message-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Sparkles, BookOpen, BarChart3, Zap, BrainCircuit, TrendingUp, Search, Activity } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

import { usePerspective } from "@/lib/perspective-context";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { activeTeamId, activeLeagueId, activeTeam, isLoading: isPerspectiveLoading } = usePerspective();

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = async (e?: React.FormEvent, value?: string) => {
    e?.preventDefault();
    const messageContent = value || input;
    if (!messageContent.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: messageContent };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            messages: [...messages, userMessage],
            activeTeamId,
            activeLeagueId,
            teamName: activeTeam?.manager || "Unknown Team"
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMessage = errData.error || `Error: ${response.status}`;
        
        console.error("Chat API Error:", response.status, errData);
        
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: response.status === 429 
              ? `⚠️ **Strategic Hold:** ${errMessage}`
              : `❌ **Error:** ${errMessage}. Please check your connection or try again later.`,
          },
        ]);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      let assistantMessage = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        assistantMessage += text;

        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: "assistant",
            content: assistantMessage,
          };
          return newMessages;
        });
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: string) => {
      handleSubmit(undefined, action);
  };

  if (messages.length === 0) {
      return (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center min-h-[80vh] max-w-2xl mx-auto px-4 w-full"
        >
            <div className="flex flex-col items-center gap-6 mb-12 text-center">
                <motion.div 
                  initial={{ scale: 0.8, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary shadow-inner border border-primary/20"
                >
                    <BrainCircuit className="w-10 h-10" />
                </motion.div>
                <div className="space-y-2">
                    <h1 className="text-4xl font-black tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                        Intelligence Hub
                    </h1>
                    <p className="text-muted-foreground text-lg font-medium max-w-md">
                        Your strategic edge in the fantasy landscape. Data-driven insights for every move.
                    </p>
                </div>
            </div>
            
            <div className="w-full max-w-xl relative mb-12">
                 <form onSubmit={handleSubmit} className="relative flex items-center w-full border-2 border-primary/10 rounded-2xl shadow-xl bg-background focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5 transition-all overflow-hidden p-1">
                    <div className="hidden sm:flex items-center gap-2 px-4 py-2 border-r border-primary/10 mr-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-widest text-primary/70">Savant</span>
                    </div>
                    <Input 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Request strategic directive, waiver scan, or trade audit..." 
                        className="flex-1 border-0 focus-visible:ring-0 shadow-none h-14 rounded-none px-4 text-lg font-medium placeholder:text-muted-foreground/50"
                    />
                    <Button type="submit" size="icon" className="h-12 w-12 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95" disabled={!input.trim() || isPerspectiveLoading}>
                        <Send className="h-5 w-5" />
                    </Button>
                </form>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                <Button 
                    variant="outline" 
                    className="rounded-2xl gap-3 h-14 justify-start px-6 border-primary/10 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                    onClick={() => handleQuickAction("Identify the top 3 streaming priorities for the next 48 hours. Focus on players who exploit my schedule density advantage and fill my weakest positions. Reference our scoring settings to justify the picks.")}
                >
                    <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center text-yellow-500 group-hover:bg-yellow-500/20">
                        <Zap className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                        <span className="text-sm font-bold">Waiver Advice</span>
                        <span className="text-[10px] text-muted-foreground">Find high-value streamers</span>
                    </div>
                </Button>
                <Button 
                    variant="outline" 
                    className="rounded-2xl gap-3 h-14 justify-start px-6 border-primary/10 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                    onClick={() => handleQuickAction("Evaluate my current roster for potential trade candidates. Who is overperforming their draft value or season averages that I should sell high? Suggest 2-3 target players from other teams that would improve my positional depth.")}
                >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-500/20">
                        <TrendingUp className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                        <span className="text-sm font-bold">Trade Audit</span>
                        <span className="text-[10px] text-muted-foreground">Identify sell-high candidates</span>
                    </div>
                </Button>
                <Button 
                    variant="outline" 
                    className="rounded-2xl gap-3 h-14 justify-start px-6 border-primary/10 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                    onClick={() => handleQuickAction("Break down my current matchup. Given the game volume difference and current score, what is my win probability? Suggest one 'must-start' and one 'potential sit' based on recent performance trends and news.")}
                >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20">
                        <BarChart3 className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                        <span className="text-sm font-bold">Matchup Prep</span>
                        <span className="text-[10px] text-muted-foreground">Win the 4th quarter</span>
                    </div>
                </Button>
                <Button 
                    variant="outline" 
                    className="rounded-2xl gap-3 h-14 justify-start px-6 border-primary/10 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                    onClick={() => handleQuickAction("Conduct a full roster audit. Identify my 3 biggest vulnerabilities (injuries, inconsistent performers, or positional gaps). For each, suggest a specific action—whether a waiver move, trade, or rotation change—using real-time intelligence.")}
                >
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 group-hover:bg-red-500/20">
                        <Activity className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                        <span className="text-sm font-bold">Roster Audit</span>
                        <span className="text-[10px] text-muted-foreground">Fix your vulnerabilities</span>
                    </div>
                </Button>
                <Button 
                    variant="outline" 
                    className="rounded-2xl gap-3 h-14 justify-start px-6 border-primary/10 hover:border-primary/30 hover:bg-primary/5 transition-all group sm:col-span-2"
                    onClick={() => handleQuickAction("Analyze the rosters of all other teams in the league. Which team has a surplus of players in a position where I am weak? Propose a fair trade involving players from my roster and theirs that addresses both teams' needs.")}
                >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 group-hover:bg-purple-500/20">
                        <Search className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                        <span className="text-sm font-bold">Trade Scouter</span>
                        <span className="text-[10px] text-muted-foreground">Find the perfect trade partner</span>
                    </div>
                </Button>
            </div>
        </motion.div>
      );
  }

  return (
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto relative overflow-hidden">
      <ScrollArea className="flex-1 px-4 pt-4" ref={scrollRef}>
        <div className="flex flex-col gap-6 pb-32 max-w-3xl mx-auto">
          <AnimatePresence mode="popLayout">
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
          </AnimatePresence>
          {isLoading && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="flex items-center gap-3 text-primary/60 p-4 ml-12 bg-primary/5 rounded-2xl border border-primary/10 w-fit"
             >
                 <Loader2 className="h-4 w-4 animate-spin" />
                 <span className="text-xs font-black uppercase tracking-widest">Processing Intelligence...</span>
             </motion.div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-20 pb-8 px-4">
        <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="relative flex items-center w-full border-2 border-primary/10 rounded-2xl shadow-2xl bg-background focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5 transition-all overflow-hidden p-1">
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 border-r border-primary/10 mr-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Submit inquiry to Savant..."
                    className="flex-1 border-0 focus-visible:ring-0 shadow-none h-12 rounded-none px-4 text-base font-medium"
                />
                <Button type="submit" size="icon" className="h-10 w-10 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95 mr-1" disabled={isLoading || !input.trim()}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
            </form>
            <div className="text-center mt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                    AI-Powered Insights • FanVise Intelligence v1.0
                </p>
            </div>
        </div>
      </div>
    </div>
  );
}
