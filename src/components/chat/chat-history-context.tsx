"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChatMessage, ChatLanguage } from '@/types/ai';
export type { ChatMessage, ChatLanguage };

export type ChatMode = "classic" | "agent";

export interface Conversation {
  id: string;
  title: string;
  lastMessageAt: string;
  activeTeamId: string | null;
  language: ChatLanguage;
  /** "classic" = single-pass RAG (/api/chat), "agent" = Supervisor (/api/agent/chat) */
  mode: ChatMode;
  messages: ChatMessage[];
}

interface ChatHistoryContextValue {
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  setActiveConversation: (conversationId: string) => void;
  setConversationLanguage: (conversationId: string, language: ChatLanguage) => void;
  setConversationMode: (conversationId: string, mode: ChatMode) => void;
  deleteConversation: (conversationId: string) => void;
  upsertConversation: (
    conversationId: string,
    updater: (conversation: Conversation) => Conversation
  ) => void;
  createConversation: (activeTeamId: string | null, language: ChatLanguage, mode?: ChatMode) => string;
}

const STORAGE_KEY = "fanvise_chat_history_v1";
const ACTIVE_STORAGE_KEY = "fanvise_active_conversation_id_v1";

const ChatHistoryContext = createContext<ChatHistoryContextValue | undefined>(undefined);

const fallbackTitle = "New Strategy Thread";

const normalizeTitle = (messages: ChatMessage[]) => {
  const firstUserPrompt = messages.find((message) => message.role === "user")?.content?.trim();
  if (!firstUserPrompt) return fallbackTitle;
  const cleaned = firstUserPrompt.replace(/\s+/g, " ");
  return cleaned.length > 68 ? `${cleaned.slice(0, 68)}...` : cleaned;
};

const createConversationDraft = (
  activeTeamId: string | null,
  language: ChatLanguage,
  mode: ChatMode = "agent"
): Conversation => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: fallbackTitle,
    lastMessageAt: now,
    activeTeamId,
    language,
    mode,
    messages: [],
  };
};

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
  // Keep the first client render identical to SSR, then restore persisted state after mount.
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [hasHydratedStorage, setHasHydratedStorage] = useState(false);

  useEffect(() => {
    try {
      const storedConversations = localStorage.getItem(STORAGE_KEY);
      if (storedConversations) {
        const parsedConversations = JSON.parse(storedConversations) as Partial<Conversation>[];
        const normalizedConversations: Conversation[] = parsedConversations.map((conversation) => ({
          id: conversation.id ?? crypto.randomUUID(),
          title: conversation.title ?? fallbackTitle,
          lastMessageAt: conversation.lastMessageAt ?? new Date().toISOString(),
          activeTeamId: conversation.activeTeamId ?? null,
          language: conversation.language ?? "en",
          mode: conversation.mode === "classic" || conversation.mode === "agent" ? conversation.mode : "agent",
          messages: Array.isArray(conversation.messages) ? conversation.messages : [],
        }));
        setConversations(normalizedConversations);
      }
    } catch (error) {
      console.error("Failed to restore chat history", error);
    } finally {
      setActiveConversationId(localStorage.getItem(ACTIVE_STORAGE_KEY));
      setHasHydratedStorage(true);
    }
  }, []);

  useEffect(() => {
    if (!hasHydratedStorage) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations, hasHydratedStorage]);

  useEffect(() => {
    if (!hasHydratedStorage) return;
    if (activeConversationId) {
      localStorage.setItem(ACTIVE_STORAGE_KEY, activeConversationId);
    } else {
      localStorage.removeItem(ACTIVE_STORAGE_KEY);
    }
  }, [activeConversationId, hasHydratedStorage]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations]
  );

  const setActiveConversation = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
  }, []);

  const createConversation = useCallback(
    (activeTeamId: string | null, language: ChatLanguage, mode: ChatMode = "agent") => {
      const conversation = createConversationDraft(activeTeamId, language, mode);
      setConversations((prev) => [conversation, ...prev]);
      setActiveConversationId(conversation.id);
      return conversation.id;
    },
    []
  );

  const upsertConversation = useCallback(
    (conversationId: string, updater: (conversation: Conversation) => Conversation) => {
      setConversations((prev) =>
        prev
          .map((conversation) => {
            if (conversation.id !== conversationId) return conversation;
            const updated = updater(conversation);
            return {
              ...updated,
              title: normalizeTitle(updated.messages),
              lastMessageAt:
                updated.messages[updated.messages.length - 1]?.createdAt ??
                updated.lastMessageAt ??
                new Date().toISOString(),
            };
          })
          .sort(
            (a, b) =>
              new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
          )
      );
    },
    []
  );

  const setConversationLanguage = useCallback(
    (conversationId: string, language: ChatLanguage) => {
      upsertConversation(conversationId, (conversation) => ({ ...conversation, language }));
    },
    [upsertConversation]
  );

  const setConversationMode = useCallback(
    (conversationId: string, mode: ChatMode) => {
      upsertConversation(conversationId, (conversation) => ({ ...conversation, mode }));
    },
    [upsertConversation]
  );

  const deleteConversation = useCallback((conversationId: string) => {
    setConversations((prev) => {
      const remaining = prev.filter((conversation) => conversation.id !== conversationId);

      setActiveConversationId((currentActiveId) => {
        if (currentActiveId !== conversationId) return currentActiveId;
        return remaining[0]?.id ?? null;
      });

      return remaining;
    });
  }, []);

  return (
    <ChatHistoryContext.Provider
      value={{
        conversations,
        activeConversationId,
        activeConversation,
        setActiveConversation,
        setConversationLanguage,
        setConversationMode,
        deleteConversation,
        upsertConversation,
        createConversation,
      }}
    >
      {children}
    </ChatHistoryContext.Provider>
  );
}

export const useChatHistory = () => {
  const context = useContext(ChatHistoryContext);
  if (!context) {
    throw new Error("useChatHistory must be used within ChatHistoryProvider");
  }
  return context;
};
