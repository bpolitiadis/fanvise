import { z } from 'zod';
import type {
    Player,
    Team,
    Matchup,
    WeeklySchedule,
    ScoringSettings,
    RosterSlots
} from '@/types/fantasy';
import type {
    AgentName,
    SupportedLanguage
} from '@/types/ai';

// Re-export core types for backward compatibility within the legacy prompt engine
export type {
    Player as PlayerContext,
    Team as TeamContext,
    Matchup as MatchupContext,
    WeeklySchedule as ScheduleContext,
    ScoringSettings,
    RosterSlots,
    AgentName,
    SupportedLanguage
};

/**
 * Complete context object for prompt generation.
 * All fields required for the FanVise Strategist to provide accurate advice.
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
    myTeam: Team;
    /** Current opponent (if in matchup) */
    opponent?: Team;
    /** Current matchup scores */
    matchup?: Matchup;
    /** Schedule density for the week */
    schedule?: WeeklySchedule;
    /** RAG-retrieved news context */
    newsContext?: string;
    /** Advanced League Intelligence */
    draftDetail?: Record<string, unknown>;
    positionalRatings?: Record<string, unknown>;
    liveScoring?: Record<string, unknown>;
    pendingTransactions?: Array<Record<string, unknown>>;
    /** Top available free agents */
    freeAgents?: Player[];
    /** Recent league transactions */
    transactions?: string[];
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Zod schema for validating Player objects.
 */
export const PlayerContextSchema = z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    fullName: z.string(),
    proTeam: z.string(),
    position: z.string(),
    injuryStatus: z.string().default('ACTIVE'),
    isInjured: z.boolean(),
    jersey: z.string().optional(),
    avgPoints: z.number().optional(),
    totalPoints: z.number().optional(),
    gamesPlayed: z.number().optional(),
    avgStats: z.record(z.string(), z.number()).optional(),
    ownership: z.object({
        percentOwned: z.number().optional(),
        percentChange: z.number().optional(),
        percentStarted: z.number().optional(),
    }).optional(),
});

/**
 * Zod schema for validating Team objects.
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
    logo: z.string().url().optional(),
    roster: z.array(PlayerContextSchema).optional(),
});

/**
 * Zod schema for validating Matchup objects.
 */
export const MatchupContextSchema = z.object({
    myScore: z.number(),
    opponentScore: z.number(),
    differential: z.number(),
    status: z.enum(['in_progress', 'completed', 'upcoming']),
    scoringPeriod: z.number().optional(),
});

/**
 * Zod schema for validating Schedule objects.
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
    scoringSettings: z.record(z.string(), z.unknown()),
    rosterSlots: z.record(z.string(), z.unknown()),
    myTeam: TeamContextSchema,
    opponent: TeamContextSchema.optional(),
    matchup: MatchupContextSchema.optional(),
    schedule: ScheduleContextSchema.optional(),
    newsContext: z.string().optional(),
    freeAgents: z.array(PlayerContextSchema).optional(),
    transactions: z.array(z.string()).optional(),
});

// Re-export AI structured response schema from centralized location
export {
    AIStructuredResponseSchema,
    type AIStructuredResponse
} from '@/types/ai';

