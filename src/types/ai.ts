/**
 * AI and Agent Related Types
 */

import { z } from 'zod';

/**
 * Supported AI agent personas.
 */
export type AgentName = 'orchestrator' | 'strategist';

/**
 * Supported response languages.
 */
export type SupportedLanguage = 'en' | 'el';

/**
 * UI-friendly alias for SupportedLanguage.
 */
export type ChatLanguage = SupportedLanguage;

/**
 * Standard chat message format.
 */
export interface ChatMessage {
    id: string;
    role: 'user' | 'model' | 'assistant' | 'system';
    content: string;
    createdAt: string;
    feedback?: 'up' | 'down' | null;
}

/**
 * Schema for structured AI responses (JSON).
 */
export const AIStructuredResponseSchema = z.object({
    /** Main response text */
    response: z.string(),
    /** Confidence level (0-1) */
    confidence: z.number().min(0).max(1).optional(),
    /** Recommended actions */
    actions: z.array(z.object({
        type: z.enum(['drop', 'add', 'trade', 'hold', 'stream']),
        playerName: z.string(),
        reason: z.string(),
    })).optional(),
    /** Data sources used */
    sources: z.array(z.string()).optional(),
});

export type AIStructuredResponse = z.infer<typeof AIStructuredResponseSchema>;
