"use client";

import { useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  User,
  Copy,
  Check,
  PencilLine,
  ThumbsDown,
  ThumbsUp,
  CornerDownLeft,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatMessage } from "@/types/ai";
import { MoveCards } from "./move-card";

interface MessageBubbleProps {
  message: ChatMessage;
  costEstimate?: {
    totalUsd: number;
    promptUsd: number;
    completionUsd: number;
    promptTokens: number;
    completionTokens: number;
    provider: "gemini" | "ollama" | "unknown";
    model: string;
  };
  timingEstimate?: {
    totalMs: number;
    firstTokenMs: number | null;
  };
  /** Active league ID — used to build the ESPN deep-link URL on move cards */
  leagueId?: string | null;
  onCopy: (value: string) => void;
  onEditSubmit: (messageId: string, nextValue: string) => void;
  onFeedback: (messageId: string, feedback: "up" | "down") => void;
  onToast: (title: string, description?: string) => void;
}

export function MessageBubble({
  message,
  costEstimate,
  timingEstimate,
  leagueId,
  onCopy,
  onEditSubmit,
  onFeedback,
  onToast,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editedValue, setEditedValue] = useState(message.content);
  const [copied, setCopied] = useState(false);

  const canSubmitEdit = editedValue.trim().length > 0 && editedValue.trim() !== message.content;

  const markdownContent = useMemo(() => message.content, [message.content]);
  const formattedCostLine = useMemo(() => {
    if (!costEstimate) return null;

    const formatUsd = (value: number) => {
      if (value <= 0) return "$0.00";
      if (value < 0.001) return "<$0.001";
      if (value < 0.01) return `$${value.toFixed(3)}`;
      return `$${value.toFixed(2)}`;
    };

    const providerLabel =
      costEstimate.provider === "ollama"
        ? "Local model"
        : costEstimate.provider === "gemini"
          ? "Gemini"
          : "AI provider";

    return `Est. cost (request + response): ${formatUsd(costEstimate.totalUsd)} (in ${formatUsd(
      costEstimate.promptUsd
    )} + out ${formatUsd(costEstimate.completionUsd)}) • ${providerLabel}`;
  }, [costEstimate]);
  const formattedTimingLine = useMemo(() => {
    if (!timingEstimate) return null;

    const totalSeconds = timingEstimate.totalMs / 1000;
    const totalLabel = totalSeconds < 10 ? `${totalSeconds.toFixed(1)}s` : `${Math.round(totalSeconds)}s`;

    if (timingEstimate.firstTokenMs === null) {
      return `Response time: ${totalLabel}`;
    }

    const firstTokenSeconds = timingEstimate.firstTokenMs / 1000;
    const firstTokenLabel =
      firstTokenSeconds < 10 ? `${firstTokenSeconds.toFixed(1)}s` : `${Math.round(firstTokenSeconds)}s`;
    return `Response time: ${totalLabel} (first token ${firstTokenLabel})`;
  }, [timingEstimate]);

  const handleMessageCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      onCopy(message.content);
      setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error("Failed to copy message", error);
      onToast("Copy failed", "Clipboard is blocked by the browser.");
    }
  };

  const submitEdit = () => {
    if (!canSubmitEdit) return;
    onEditSubmit(message.id, editedValue.trim());
    setIsEditing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "group flex w-full items-start gap-4 rounded-2xl p-4 transition-all",
        isUser 
          ? "bg-transparent" 
          : "border border-primary/10 bg-primary/5 shadow-sm"
      )}
    >
      <Avatar className={cn(
        "h-9 w-9 border shrink-0 shadow-sm",
        isUser ? "border-secondary/20 bg-secondary/10" : "border-primary/20 bg-primary/10"
      )}>
        {isUser ? (
          <AvatarFallback className="bg-secondary/10 text-secondary text-[11px] font-bold">
            <User className="h-4 w-4" />
          </AvatarFallback>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary text-primary-foreground">
              <Bot className="h-5 w-5" />
          </div>
        )}
      </Avatar>

      <div className="flex-1 space-y-2 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
            <span className={cn(
                "font-bold text-xs uppercase tracking-wider",
                isUser ? "text-secondary" : "text-primary"
            )}>
                {isUser ? "You" : "FanVise Intelligence"}
            </span>
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-success focus-visible:ring-2 focus-visible:ring-ring"
                onClick={handleMessageCopy}
                aria-label="Copy message"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>

              {isUser && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setEditedValue(message.content);
                    setIsEditing(true);
                  }}
                  aria-label="Edit and resubmit"
                >
                  <PencilLine className="h-3.5 w-3.5" />
                </Button>
              )}

              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onFeedback(message.id, "up")}
                className={cn(
                  "h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  message.feedback === "up" && "bg-success/15 text-success"
                )}
                aria-label="Positive feedback"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onFeedback(message.id, "down")}
                className={cn(
                  "h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  message.feedback === "down" && "bg-red-500/15 text-red-400"
                )}
                aria-label="Negative feedback"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </Button>
            </div>
        </div>

        {isEditing ? (
          <div className="space-y-2 rounded-xl border border-border bg-card/70 p-2">
            <Input
              value={editedValue}
              onChange={(event) => setEditedValue(event.target.value)}
              className="border-border bg-background"
              placeholder="Refine your prompt"
              onKeyDown={(event) => {
                if (event.key === "Enter") submitEdit();
                if (event.key === "Escape") setIsEditing(false);
              }}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={submitEdit}
                disabled={!canSubmitEdit}
                className="h-7 rounded-lg bg-primary/90 px-2 text-[11px]"
              >
                <CornerDownLeft className="mr-1 h-3.5 w-3.5" />
                Resubmit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 rounded-lg px-2 text-[11px]"
                onClick={() => setIsEditing(false)}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div
              className={cn(
                "prose prose-sm max-w-none wrap-break-word leading-relaxed",
                "prose-slate dark:prose-invert",
                "prose-p:text-foreground prose-p:leading-relaxed prose-p:mb-3",
                "prose-headings:font-bold prose-headings:text-foreground prose-headings:mb-2",
                "prose-strong:text-foreground prose-strong:font-bold",
                "prose-li:text-foreground/90 prose-li:my-1",
                "prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
                "prose-pre:bg-transparent prose-pre:border-0 prose-pre:p-0 prose-pre:rounded-none",
                isUser ? "text-foreground" : "text-foreground font-medium"
              )}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const language = match?.[1] || "text";
                    const isInline = !match;
                    const code = String(children).replace(/\n$/, "");

                    if (isInline) {
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }

                    return (
                      <div className="my-4 overflow-hidden rounded-xl border border-border bg-card">
                        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
                          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            {language}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-success hover:bg-success/10 hover:text-success focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(code);
                                onToast("Code copied", "Snippet copied to clipboard.");
                              } catch {
                                onToast("Copy failed", "Could not copy this code block.");
                              }
                            }}
                          >
                            <Copy className="mr-1 h-3 w-3" />
                            Copy code
                          </Button>
                        </div>
                        <SyntaxHighlighter
                          language={language}
                          style={oneDark}
                          customStyle={{
                            margin: 0,
                            background: "transparent",
                            padding: "0.85rem 0.95rem",
                            fontSize: "0.82rem",
                          }}
                          codeTagProps={{
                            style: {
                              fontFamily: "var(--font-geist-mono)",
                            },
                          }}
                        >
                          {code}
                        </SyntaxHighlighter>
                      </div>
                    );
                  },
                }}
              >
                {markdownContent}
              </ReactMarkdown>
            </div>
            {/* Structured move recommendation cards — rendered for optimizer responses */}
            {!isUser && message.rankedMoves && message.rankedMoves.length > 0 && (
              <MoveCards
                moves={message.rankedMoves}
                fetchedAt={message.fetchedAt ?? new Date().toISOString()}
                windowStart={message.windowStart}
                windowEnd={message.windowEnd}
                leagueId={leagueId}
              />
            )}

            {!isUser && formattedCostLine && (
              <p className="mt-3 text-[11px] text-muted-foreground/90">{formattedCostLine}</p>
            )}
            {!isUser && formattedTimingLine && (
              <p className="mt-1 text-[11px] text-muted-foreground/90">{formattedTimingLine}</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
