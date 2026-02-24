"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageBubble } from "./message-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Send,
  Loader2,
  Sparkles,
  BarChart3,
  Zap,
  BrainCircuit,
  Search,
  Activity,
  ChevronDown,
  CheckCircle2,
  Bot,
  Cpu,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { usePerspective } from "@/lib/perspective-context";
import {
  useChatHistory,
  type ChatMode,
} from "@/components/chat/chat-history-context";
import type { ChatLanguage, ChatMessage } from "@/types/ai";

interface ToastState {
  id: string;
  title: string;
  description?: string;
}

interface ResponseCostEstimate {
  totalUsd: number;
  promptUsd: number;
  completionUsd: number;
  promptTokens: number;
  completionTokens: number;
  provider: "gemini" | "ollama" | "unknown";
  model: string;
}

interface ResponseTimingEstimate {
  totalMs: number;
  firstTokenMs: number | null;
}

const STREAM_HEARTBEAT_TOKEN = "[[FV_STREAM_READY]]";
const CHARS_PER_TOKEN_ESTIMATE = 4;
const GEMINI_FLASH_INPUT_USD_PER_MILLION = 0.1;
const GEMINI_FLASH_OUTPUT_USD_PER_MILLION = 0.4;

const estimateTokens = (text: string): number => {
  if (!text.trim()) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
};

const getProviderPricing = (provider: ResponseCostEstimate["provider"]) => {
  if (provider === "ollama") {
    return { inputUsdPerMillion: 0, outputUsdPerMillion: 0 };
  }

  if (provider === "gemini") {
    return {
      inputUsdPerMillion: GEMINI_FLASH_INPUT_USD_PER_MILLION,
      outputUsdPerMillion: GEMINI_FLASH_OUTPUT_USD_PER_MILLION,
    };
  }

  return {
    inputUsdPerMillion: GEMINI_FLASH_INPUT_USD_PER_MILLION,
    outputUsdPerMillion: GEMINI_FLASH_OUTPUT_USD_PER_MILLION,
  };
};

// ─── Agent Mode Toggle ────────────────────────────────────────────────────────

interface AgentModeToggleProps {
  isAgent: boolean;
  onToggle: () => void;
  size?: "sm" | "lg";
}

function AgentModeToggle({ isAgent, onToggle, size = "sm" }: AgentModeToggleProps) {
  const isLarge = size === "lg";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={isAgent ? "Switch to Classic mode" : "Switch to Agent mode (live research)"}
      aria-label={isAgent ? "Disable agent mode" : "Enable agent mode"}
      className={`relative flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isLarge ? "h-10 text-xs" : "h-8 text-[11px]"
      } ${
        isAgent
          ? "border-violet-500/40 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
          : "border-muted text-muted-foreground hover:border-primary/30 hover:text-primary/70"
      }`}
    >
      {isAgent ? (
        <Bot className={isLarge ? "h-4 w-4" : "h-3.5 w-3.5"} />
      ) : (
        <Cpu className={isLarge ? "h-4 w-4" : "h-3.5 w-3.5"} />
      )}
      <span className="hidden font-bold uppercase tracking-wider sm:inline">
        {isAgent ? "Agent" : "Classic"}
      </span>
    </button>
  );
}

// ─── Cost estimation ──────────────────────────────────────────────────────────

const estimateResponseCost = ({
  requestPayload,
  responseText,
  provider,
  model,
}: {
  requestPayload: unknown;
  responseText: string;
  provider: ResponseCostEstimate["provider"];
  model: string;
}): ResponseCostEstimate => {
  const promptTokens = estimateTokens(JSON.stringify(requestPayload));
  const completionTokens = estimateTokens(responseText);
  const pricing = getProviderPricing(provider);
  const promptUsd = (promptTokens / 1_000_000) * pricing.inputUsdPerMillion;
  const completionUsd = (completionTokens / 1_000_000) * pricing.outputUsdPerMillion;

  return {
    totalUsd: promptUsd + completionUsd,
    promptUsd,
    completionUsd,
    promptTokens,
    completionTokens,
    provider,
    model,
  };
};

export function ChatInterface() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [messageCostById, setMessageCostById] = useState<Record<string, ResponseCostEstimate>>({});
  const [messageTimingById, setMessageTimingById] = useState<Record<string, ResponseTimingEstimate>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { activeTeamId, activeLeagueId, activeTeam, isLoading: isPerspectiveLoading } = usePerspective();
  const {
    conversations,
    activeConversation,
    activeConversationId,
    createConversation,
    setActiveConversation,
    setConversationMode,
    upsertConversation,
  } = useChatHistory();

  const messages = useMemo(() => activeConversation?.messages ?? [], [activeConversation?.messages]);
  const responseLanguage: ChatLanguage = activeConversation?.language ?? "en";
  const chatMode: ChatMode = activeConversation?.mode ?? "agent";
  const isAgentMode = chatMode === "agent";

  const showToast = (title: string, description?: string) => {
    const nextToast = { id: crypto.randomUUID(), title, description };
    setToasts((prev) => [...prev, nextToast]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== nextToast.id));
    }, 2200);
  };

  useEffect(() => {
    if (!activeTeamId) return;
    const teamConversations = conversations.filter(
      (conversation) => conversation.activeTeamId === activeTeamId
    );
    if (teamConversations.length === 0) {
      createConversation(activeTeamId, "en");
      return;
    }
    if (!activeConversation || activeConversation.activeTeamId !== activeTeamId) {
      setActiveConversation(teamConversations[0].id);
    }
  }, [
    activeConversation,
    activeTeamId,
    conversations,
    createConversation,
    setActiveConversation,
  ]);

  useEffect(() => {
    if (!isAtBottom) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading, isAtBottom]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 80;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setIsAtBottom(isNearBottom);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setIsAtBottom(true);
  };

  const ensureConversationId = () => {
    if (activeConversationId) return activeConversationId;
    return createConversation(activeTeamId ?? null, "en");
  };

  const createMessage = (
    role: "user" | "assistant",
    content: string,
    feedback?: "up" | "down" | null
  ): ChatMessage => ({
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    feedback,
  });

  const persistMessages = (conversationId: string, nextMessages: ChatMessage[]) => {
    upsertConversation(conversationId, (conversation) => ({
      ...conversation,
      activeTeamId: activeTeamId ?? conversation.activeTeamId,
      messages: nextMessages,
    }));
  };

  const streamAssistantReply = async (conversationId: string, requestMessages: ChatMessage[]) => {
    const assistantDraft = createMessage("assistant", "");
    persistMessages(conversationId, [...requestMessages, assistantDraft]);
    const requestStartTime = performance.now();

    const requestPayload = {
      messages: requestMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      activeTeamId: (activeTeamId === "null" || !activeTeamId) ? undefined : activeTeamId,
      activeLeagueId: (activeLeagueId === "null" || !activeLeagueId) ? undefined : activeLeagueId,
      teamName: activeTeam?.manager || "Unknown Team",
      language: responseLanguage,
    };

    // Route to the appropriate backend based on the active chat mode
    const endpoint = isAgentMode ? "/api/agent/chat" : "/api/chat";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMessage = errData.error || `Error: ${response.status}`;
      const errorText =
        response.status === 429
          ? `⚠️ **Strategic Hold:** ${errMessage}`
          : `❌ **Error:** ${errMessage}. Please check your connection or try again later.`;
      persistMessages(conversationId, [...requestMessages, createMessage("assistant", errorText)]);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) return;
    const providerHeader = response.headers.get("x-fanvise-ai-provider");
    const modelHeader = response.headers.get("x-fanvise-ai-model");
    const agentHeader = response.headers.get("x-fanvise-agent");
    const provider: ResponseCostEstimate["provider"] =
      providerHeader === "ollama" ? "ollama" : providerHeader === "gemini" ? "gemini" : "unknown";
    const model = agentHeader === "supervisor"
      ? `${modelHeader ?? "gemini"} (agent)`
      : (modelHeader || "unknown");

    let assistantMessage = "";
    let firstTokenMs: number | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = new TextDecoder().decode(value);
      const sanitizedText = text.replaceAll(STREAM_HEARTBEAT_TOKEN, "");
      if (!sanitizedText) continue;
      if (firstTokenMs === null) {
        firstTokenMs = performance.now() - requestStartTime;
      }
      assistantMessage += sanitizedText;
      persistMessages(conversationId, [
        ...requestMessages,
        { ...assistantDraft, content: assistantMessage },
      ]);
    }
    const totalMs = performance.now() - requestStartTime;

    setMessageCostById((prev) => ({
      ...prev,
      [assistantDraft.id]: estimateResponseCost({
        requestPayload,
        responseText: assistantMessage,
        provider,
        model,
      }),
    }));
    setMessageTimingById((prev) => ({
      ...prev,
      [assistantDraft.id]: {
        totalMs,
        firstTokenMs,
      },
    }));
  };

  const handleSubmit = async (
    event?: React.FormEvent,
    value?: string,
    editMessageId?: string
  ) => {
    event?.preventDefault();
    const messageContent = (value ?? input).trim();
    if (!messageContent || isLoading) return;

    const conversationId = ensureConversationId();
    setInput("");
    setIsLoading(true);

    try {
      let nextMessages: ChatMessage[] = [];

      if (editMessageId) {
        const editedIndex = messages.findIndex((message) => message.id === editMessageId);
        if (editedIndex === -1 || messages[editedIndex].role !== "user") return;
        const editedMessage: ChatMessage = {
          ...messages[editedIndex],
          content: messageContent,
          createdAt: new Date().toISOString(),
        };
        nextMessages = [...messages.slice(0, editedIndex), editedMessage];
      } else {
        nextMessages = [...messages, createMessage("user", messageContent)];
      }

      persistMessages(conversationId, nextMessages);
      await streamAssistantReply(conversationId, nextMessages);
    } catch (error) {
      console.error("Chat error:", error);
      persistMessages(conversationId, [
        ...messages,
        createMessage("assistant", "Sorry, I encountered an error. Please try again."),
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = (messageId: string, feedback: "up" | "down") => {
    if (!activeConversationId) return;
    upsertConversation(activeConversationId, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.id === messageId ? { ...message, feedback } : message
      ),
    }));
  };

  const handleCopy = () => {
    showToast("Copied", "Message copied to clipboard.");
  };

  const handleQuickAction = (action: string) => {
    void handleSubmit(undefined, action);
  };

  const handleToggleMode = () => {
    const nextMode: ChatMode = isAgentMode ? "classic" : "agent";
    if (activeConversationId) {
      setConversationMode(activeConversationId, nextMode);
    } else {
      // No conversation yet — create one with the target mode so first message uses it
      const newId = createConversation(activeTeamId ?? null, responseLanguage, nextMode);
      void newId;
    }
    showToast(
      nextMode === "agent" ? "Agent Mode On" : "Classic Mode On",
      nextMode === "agent"
        ? "Supervisor agent will research live data."
        : "Single-pass RAG — fast and lightweight."
    );
  };

  const thinkingIndicator = (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="ml-12 w-fit rounded-2xl border border-primary/20 bg-card/90 px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <div className="relative h-3.5 w-3.5">
          <span className="absolute inset-0 rounded-full bg-primary/50 animate-ping" />
          <span className="absolute inset-[2px] rounded-full bg-primary" />
        </div>
        <div className="flex items-end gap-1">
          <span className="h-1.5 w-6 rounded-full bg-primary/60 animate-pulse" />
          <span className="h-2 w-10 rounded-full bg-primary/40 animate-pulse [animation-delay:200ms]" />
          <span className="h-1.5 w-8 rounded-full bg-primary/50 animate-pulse [animation-delay:400ms]" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-widest text-primary/90">
          Thinking...
        </span>
      </div>
    </motion.div>
  );

  if (messages.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto flex min-h-[80vh] w-full max-w-2xl flex-col items-center justify-center px-4"
      >
        <div className="mb-10 flex flex-col items-center gap-6 text-center">
          <motion.div
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-primary shadow-inner"
          >
            <BrainCircuit className="h-10 w-10" />
          </motion.div>
          <div className="space-y-2">
            <h1 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text text-4xl font-black tracking-tight text-transparent">
              Intelligence Hub
            </h1>
            <p className="max-w-md text-lg font-medium text-muted-foreground">
              FanVise Strategist online for{" "}
              <span className="text-primary">{activeTeam?.manager ?? "your perspective"}</span>.
            </p>
          </div>
        </div>

        <div className="relative mb-10 w-full max-w-xl">
          <form
            onSubmit={handleSubmit}
            className="relative flex w-full items-center overflow-hidden rounded-2xl border-2 border-primary/10 bg-background p-1 shadow-xl transition-all focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5"
          >
            <div className="mr-2 hidden items-center gap-2 border-r border-primary/10 px-4 py-2 sm:flex">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-primary/70">
                Strategist
              </span>
            </div>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Request strategic directive, waiver scan, or trade audit..."
              className="h-14 flex-1 rounded-none border-0 px-4 text-lg font-medium shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
            />
            <AgentModeToggle isAgent={isAgentMode} onToggle={handleToggleMode} size="lg" />
            <Button
              type="submit"
              size="icon"
              className="h-12 w-12 rounded-xl bg-primary shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95"
              disabled={!input.trim() || isPerspectiveLoading}
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>

        <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="group h-14 justify-start gap-3 rounded-2xl border-primary/10 px-6 transition-all hover:border-primary/30 hover:bg-primary/5"
            onClick={() =>
              handleQuickAction(
                "Perform a comprehensive audit of my team and roster. Give me a full overview including best and worst performers, a complete injury report, and potential streaming options. Also, include my current score, league standings, and matchup status."
              )
            }
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500 group-hover:bg-red-500/20">
              <Activity className="h-4 w-4" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-sm font-bold">Team Audit</span>
              <span className="text-[11px] text-muted-foreground">Full roster & standings overview</span>
            </div>
          </Button>

          <Button
            variant="outline"
            className="group h-14 justify-start gap-3 rounded-2xl border-primary/10 px-6 transition-all hover:border-primary/30 hover:bg-primary/5"
            onClick={() =>
              handleQuickAction(
                "Provide a deep-dive review of my current matchup. Compare best/worst performers from both teams, track total games played vs. remaining, and suggest available healthy free agents to stream to secure the win."
              )
            }
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-sm font-bold">Matchup Review</span>
              <span className="text-[11px] text-muted-foreground">Win the active week</span>
            </div>
          </Button>

          <Button
            variant="outline"
            className="group h-14 justify-start gap-3 rounded-2xl border-primary/10 px-6 transition-all hover:border-primary/30 hover:bg-primary/5"
            onClick={() =>
              handleQuickAction(
                "Identify the 10 best healthy or DTD free agents available. Compare their positions with my team's needs, suggest specific drop candidates to make room, and justify each recommendation with the latest news and player outlooks."
              )
            }
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500 group-hover:bg-purple-500/20">
              <Search className="h-4 w-4" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-sm font-bold">Waiver Research</span>
              <span className="text-[11px] text-muted-foreground">Find top available talent</span>
            </div>
          </Button>

          <Button
            variant="outline"
            className="group h-14 justify-start gap-3 rounded-2xl border-primary/10 px-6 transition-all hover:border-primary/30 hover:bg-primary/5"
            onClick={() =>
              handleQuickAction(
                "Check my team for any injured or Day-to-Day (DTD) players. Fetch the latest reports on their return timelines, injury progress, and status updates. Suggest how to optimize my IR slots and if any injured players are safe to drop or need immediate coverage."
              )
            }
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-500 group-hover:bg-yellow-500/20">
              <Zap className="h-4 w-4" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-sm font-bold">Injury Report</span>
              <span className="text-[11px] text-muted-foreground">Return timelines & IR optimization</span>
            </div>
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 pt-4"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                costEstimate={messageCostById[message.id]}
                timingEstimate={messageTimingById[message.id]}
                onFeedback={handleFeedback}
                onCopy={handleCopy}
                onToast={showToast}
                onEditSubmit={(messageId, nextValue) => {
                  void handleSubmit(undefined, nextValue, messageId);
                }}
              />
            ))}
          </AnimatePresence>
          {isLoading && thinkingIndicator}
          <div ref={bottomRef} />
        </div>
      </div>

      {!isAtBottom && (
        <div className="pointer-events-none absolute bottom-20 right-6 z-20">
          <Button
            type="button"
            size="icon"
            onClick={scrollToBottom}
            className="pointer-events-auto h-10 w-10 rounded-full border border-border bg-card/90 text-primary shadow-xl hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Scroll to bottom"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="border-t border-border bg-background px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <form
            onSubmit={handleSubmit}
            className={`relative flex w-full items-center overflow-hidden rounded-2xl border-2 bg-background p-1 shadow-xl transition-all focus-within:ring-4 ${
              isAgentMode
                ? "border-violet-500/30 focus-within:border-violet-500/50 focus-within:ring-violet-500/10"
                : "border-primary/10 focus-within:border-primary/30 focus-within:ring-primary/5"
            }`}
          >
            <div className="mr-2 hidden items-center gap-2 border-r border-primary/10 px-3 py-2 sm:flex">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isAgentMode
                  ? "Agent will research live data for your question..."
                  : responseLanguage === "el"
                  ? "Υποβολή ερωτήματος στον Strategist..."
                  : "Submit inquiry to Strategist..."
              }
              className="h-12 flex-1 rounded-none border-0 px-4 text-base font-medium shadow-none focus-visible:ring-0"
            />
            <AgentModeToggle isAgent={isAgentMode} onToggle={handleToggleMode} size="sm" />
            <Button
              type="submit"
              size="icon"
              className={`mr-1 h-10 w-10 rounded-xl shadow-lg transition-all hover:opacity-90 active:scale-95 ${
                isAgentMode
                  ? "bg-violet-600 shadow-violet-500/20"
                  : "bg-primary shadow-primary/20"
              }`}
              disabled={isLoading || !input.trim()}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <div className="mt-2 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80">
              Perspective: {activeTeam?.manager ?? "No Team"} •{" "}
              {isAgentMode ? (
                <span className="text-violet-400">Agent Mode</span>
              ) : (
                "Classic"
              )}{" "}
              • Language: {responseLanguage === "el" ? "Greek" : "English"}
            </p>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-4 z-50 space-y-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              className="pointer-events-auto flex min-w-[220px] items-start gap-2 rounded-xl border border-success/20 bg-card px-3 py-2 shadow-2xl"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
              <div>
                <p className="text-xs font-semibold text-foreground">{toast.title}</p>
                {toast.description && <p className="text-[11px] text-muted-foreground">{toast.description}</p>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
