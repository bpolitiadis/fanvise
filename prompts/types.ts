import { z } from 'zod';

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Available AI agent personas in the FanVise system.
 * Each agent has a distinct personality and expertise area.
 */
export type AgentName = 'consigliere' | 'strategist';

/**
 * Supported languages for prompt localization.
 * - 'en': English (default)
 * - 'el': Greek (Ελληνικά)
 */
export type SupportedLanguage = 'en' | 'el';

// ============================================================================
// Context Types
// ============================================================================

/**
 * Scoring settings for the league.
 * Maps stat categories to their point values.
 * @example { "PTS": 1, "AST": 1.5, "REB": 1.2, "BLK": 3, "STL": 3, "TO": -1 }
 */
export type ScoringSettings = Record<string, number>;

/**
 * Roster slot configuration.
 * Maps position slots to their count.
 * @example { "PG": 1, "SG": 1, "SF": 1, "PF": 1, "C": 1, "UTIL": 3, "BE": 3 }
 */
export type RosterSlots = Record<string, number>;

/**
 * Team context for prompt injection.
 */
export interface TeamContext {
    /** Team ID (ESPN format) */
    id: string;
    /** Team display name */
    name: string;
    /** Team abbreviation */
    abbrev: string;
    /** Manager/owner name */
    manager: string;
    /** Current record */
    record?: {
        wins: number;
        losses: number;
        ties: number;
    };
    /** Whether this is the user's own team */
    isUserOwned?: boolean;
}

/**
 * Current matchup state.
 */
export interface MatchupContext {
    /** User's current score */
    myScore: number;
    /** Opponent's current score */
    opponentScore: number;
    /** Point differential (positive = winning) */
    differential: number;
    /** Matchup status */
    status: 'in_progress' | 'completed' | 'upcoming';
    /** Current scoring period/week */
    scoringPeriod?: number;
}

/**
 * Schedule density for the current week.
 * Used for streaming and lineup optimization decisions.
 */
export interface ScheduleContext {
    /** Games my team has played this week */
    myGamesPlayed: number;
    /** Games my team has remaining this week */
    myGamesRemaining: number;
    /** Games opponent has played this week */
    opponentGamesPlayed: number;
    /** Games opponent has remaining this week */
    opponentGamesRemaining: number;
}

/**
 * Complete context object for prompt generation.
 * All fields required for the Strategic Consigliere to provide accurate advice.
 */
export interface PromptContext {
    /** Response language */
    language: SupportedLanguage;
    /** League name */
    leagueName: string;
    /** League scoring configuration */
    scoringSettings: ScoringSettings;
    /** League roster slot configuration */
    rosterSlots: RosterSlots;
    /** Active team context (perspective) */
    myTeam: TeamContext;
    /** Current opponent (if in matchup) */
    opponent?: TeamContext;
    /** Current matchup scores */
    matchup?: MatchupContext;
    /** Schedule density for the week */
    schedule?: ScheduleContext;
    /** RAG-retrieved news context */
    newsContext?: string;
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Zod schema for validating TeamContext objects.
 */
export const TeamContextSchema = z.object({
    id: z.string(),
    name: z.string(),
    abbrev: z.string(),
    manager: z.string(),
    record: z.object({
        wins: z.number(),
        losses: z.number(),
        ties: z.number(),
    }).optional(),
    isUserOwned: z.boolean().optional(),
});

/**
 * Zod schema for validating MatchupContext objects.
 */
export const MatchupContextSchema = z.object({
    myScore: z.number(),
    opponentScore: z.number(),
    differential: z.number(),
    status: z.enum(['in_progress', 'completed', 'upcoming']),
    scoringPeriod: z.number().optional(),
});

/**
 * Zod schema for validating ScheduleContext objects.
 */
export const ScheduleContextSchema = z.object({
    myGamesPlayed: z.number(),
    myGamesRemaining: z.number(),
    opponentGamesPlayed: z.number(),
    opponentGamesRemaining: z.number(),
});

/**
 * Zod schema for validating the complete PromptContext.
 */
export const PromptContextSchema = z.object({
    language: z.enum(['en', 'el']),
    leagueName: z.string(),
    scoringSettings: z.record(z.string(), z.number()),
    rosterSlots: z.record(z.string(), z.number()),
    myTeam: TeamContextSchema,
    opponent: TeamContextSchema.optional(),
    matchup: MatchupContextSchema.optional(),
    schedule: ScheduleContextSchema.optional(),
    newsContext: z.string().optional(),
});

// ============================================================================
// AI Response Schemas
// ============================================================================

/**
 * Schema for validating structured AI responses.
 * Used when the AI returns JSON-formatted data.
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
