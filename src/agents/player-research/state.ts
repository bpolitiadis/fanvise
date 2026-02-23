/**
 * Player Research Agent — State Definition
 *
 * LangGraph requires an explicit state type. All nodes read from and write to
 * this state object. Using the `Annotation` API (LangGraph ≥1.0) gives us
 * typed reducers so concurrent node writes are merged safely.
 */

import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

export interface PlayerStatusResult {
  playerId: number | null;
  playerName: string;
  injuryStatus: string | null;
  injuryType: string | null;
  expectedReturnDate: string | null;
  isInjured: boolean;
  lastNewsDate: string | null;
  source: string;
  fetchedAt: string;
}

export interface NewsItem {
  title: string | null;
  summary: string | null;
  publishedAt: string | null;
  source: string | null;
  injuryStatus: string | null;
  sentiment: string | null;
  trustLevel: number | null;
  url: string | null;
}

export interface PlayerResearchState {
  messages: BaseMessage[];
  /** The canonical player name as resolved from the query */
  playerName: string;
  /** Raw query text (may differ from resolved name) */
  originalQuery: string;
  /** ESPN player card status — null until fetched */
  espnStatus: PlayerStatusResult | null;
  /** Recent news items from vector search */
  newsItems: NewsItem[];
  /** Final structured research report */
  report: PlayerResearchReport | null;
  /** Number of tool-call iterations (guard against loops) */
  iterationCount: number;
  /** Any error encountered during research */
  error: string | null;
}

export interface PlayerResearchReport {
  playerName: string;
  status: string;
  injuryType: string | null;
  expectedReturnDate: string | null;
  recommendation: "HOLD" | "STREAM" | "DROP" | "MONITOR" | "ACTIVE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
  sources: string[];
  fetchedAt: string;
}

// LangGraph Annotation — defines state shape with reducers
export const PlayerResearchAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  playerName: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  originalQuery: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  espnStatus: Annotation<PlayerStatusResult | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  newsItems: Annotation<NewsItem[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  report: Annotation<PlayerResearchReport | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  iterationCount: Annotation<number>({
    reducer: (curr, next) => curr + next,
    default: () => 0,
  }),
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});
