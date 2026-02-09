import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex w-full items-start gap-4 p-4 transition-all rounded-2xl",
        isUser 
          ? "bg-transparent" 
          : "bg-primary/5 border border-primary/10 shadow-sm"
      )}
    >
      <Avatar className={cn(
        "h-9 w-9 border shrink-0 shadow-sm",
        isUser ? "border-secondary/20 bg-secondary/10" : "border-primary/20 bg-primary/10"
      )}>
        {isUser ? (
          <AvatarFallback className="bg-secondary/10 text-secondary text-[10px] font-bold">
            <User className="h-4 w-4" />
          </AvatarFallback>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary text-primary-foreground">
              <Bot className="h-5 w-5" />
          </div>
        )}
      </Avatar>

      <div className="flex-1 space-y-1.5 overflow-hidden">
        <div className="flex items-center gap-2">
            <span className={cn(
                "font-bold text-xs uppercase tracking-wider",
                isUser ? "text-secondary" : "text-primary"
            )}>
                {isUser ? "You" : "FanVise Intelligence"}
            </span>
        </div>
        <div className={cn(
            "prose prose-sm max-w-none break-words leading-relaxed",
            "prose-slate dark:prose-invert",
            "prose-p:text-foreground prose-p:leading-relaxed prose-p:mb-3",
            "prose-headings:font-bold prose-headings:text-foreground prose-headings:mb-2",
            "prose-strong:text-foreground prose-strong:font-bold",
            "prose-li:text-foreground/90 prose-li:my-1",
            "prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
            "prose-pre:bg-muted prose-pre:border prose-pre:p-4 prose-pre:rounded-xl",
            isUser ? "text-foreground" : "text-foreground font-medium"
        )}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}
