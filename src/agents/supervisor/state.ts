/**
 * Supervisor Agent — State Definition
 *
 * The Supervisor holds the full conversation context plus the accumulated
 * results of every tool call it makes. The final `answer` field is what
 * gets streamed back to the user.
 */

import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { QueryIntent } from "@/agents/shared/types";

export const SupervisorAnnotation = Annotation.Root({
  /** Full conversation thread — human messages + LLM responses + tool results */
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  /** The user's active team ID (injected from perspective context) */
  teamId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  /** The user's active league ID */
  leagueId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  /** Response language ("en" | "el") — from UI toggle */
  language: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "en",
  }),

  /** Resolved query intent — helps the final answer node format output */
  intent: Annotation<QueryIntent | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  /** Final synthesized answer text (streamed to the user) */
  answer: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  /** Total tool calls made in this turn (loop guard) */
  toolCallCount: Annotation<number>({
    reducer: (curr, next) => curr + next,
    default: () => 0,
  }),

  /** Error state — surfaced in the answer if set */
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});
