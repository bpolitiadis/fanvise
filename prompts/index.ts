/**
 * FanVise Prompt Engine
 * 
 * Centralized prompt management for AI agents.
 * This module provides a clean API for generating context-aware system prompts.
 * 
 * @module prompts
 */

import { getOrchestratorPrompt } from './agents/orchestrator';
import { PromptContextSchema } from './types';
import type {
    AgentName,
    PromptContext,
    SupportedLanguage,
    TeamContext,
    MatchupContext,
    ScheduleContext,
    ScoringSettings,
    RosterSlots,
    PlayerContext,
} from './types';

// Re-export types for convenience
export type {
    AgentName,
    PromptContext,
    SupportedLanguage,
    TeamContext,
    MatchupContext,
    ScheduleContext,
    ScoringSettings,
    RosterSlots,
};

// Re-export schemas for validation
export {
    PromptContextSchema,
    TeamContextSchema,
    MatchupContextSchema,
    ScheduleContextSchema,
    AIStructuredResponseSchema,
} from './types';

// ============================================================================
// Main API
// ============================================================================

/**
 * Generates a system prompt for the specified AI agent.
 * 
 * This is the main entry point for the prompt engine. It validates the context,
 * selects the appropriate template based on agent and language, and returns
 * a fully-formed system prompt string.
 * 
 * @param agentName - The AI agent persona to use
 * @param context - The complete context for prompt generation
 * @returns The formatted system prompt string
 * @throws {Error} If context validation fails
 * 
 * @example
 * ```typescript
 * import { getSystemPrompt } from '@/prompts';
 * 
 * const prompt = getSystemPrompt('orchestrator', {
 *   language: 'en',
 *   leagueName: 'Office Champions',
 *   scoringSettings: { PTS: 1, AST: 1.5, REB: 1.2, BLK: 3, STL: 3, TO: -1 },
 *   rosterSlots: { PG: 1, SG: 1, SF: 1, PF: 1, C: 1, UTIL: 3, BE: 3 },
 *   myTeam: {
 *     id: '1',
 *     name: 'Alpha Wolves',
 *     abbrev: 'AW',
 *     manager: 'John Doe',
 *     isUserOwned: true,
 *   },
 *   opponent: {
 *     id: '5',
 *     name: 'Beta Bears',
 *     abbrev: 'BB',
 *     manager: 'Jane Smith',
 *   },
 *   matchup: {
 *     myScore: 450.5,
 *     opponentScore: 420.0,
 *     differential: 30.5,
 *     status: 'in_progress',
 *   },
 * });
 * ```
 */
export function getSystemPrompt(agentName: AgentName, context: PromptContext): string {
    // Validate context with Zod
    const validationResult = PromptContextSchema.safeParse(context);

    if (!validationResult.success) {
        console.error('Prompt context validation failed:', validationResult.error.format());
        throw new Error(`Invalid prompt context: ${validationResult.error.message}`);
    }

    // Select agent template
    switch (agentName) {
        case 'orchestrator':
            return getOrchestratorPrompt(context);

        case 'strategist':
            // Future: Add strategist agent for lineup optimization
            // For now, fall back to orchestrator
            console.warn('Strategist agent not yet implemented, using orchestrator');
            return getOrchestratorPrompt(context);

        default:
            throw new Error(`Unknown agent: ${agentName}`);
    }
}

// ============================================================================
// Context Builders
// ============================================================================

/**
 * Creates a minimal valid PromptContext with defaults for missing fields.
 * Useful for testing or when full context is not available.
 * 
 * @param partial - Partial context to merge with defaults
 * @returns Complete PromptContext with defaults applied
 */
export function createDefaultContext(partial: Partial<PromptContext> = {}): PromptContext {
    const defaults: PromptContext = {
        language: 'en',
        leagueName: 'Fantasy League',
        scoringSettings: {},
        rosterSlots: {},
        myTeam: {
            id: '0',
            name: 'My Team',
            abbrev: 'MT',
            manager: 'Manager',
        },
    };

    return { ...defaults, ...partial };
}

/**
 * Creates a PromptContext from an Intelligence Snapshot.
 * This is the bridge between the league service and the prompt engine.
 * 
 * @param snapshot - The intelligence snapshot from league.service
 * @param language - The user's preferred language
 * @param newsContext - Optional RAG-retrieved news context
 * @returns A valid PromptContext for prompt generation
 */
export function contextFromSnapshot(
    snapshot: {
        league: {
            name: string;
            scoringSettings: ScoringSettings;
            rosterSlots: RosterSlots;
            draftDetail?: Record<string, unknown>;
            positionalRatings?: Record<string, unknown>;
            liveScoring?: Record<string, unknown>;
        };
        myTeam: TeamContext;
        opponent?: TeamContext;
        matchup?: MatchupContext;
        schedule?: ScheduleContext;
        freeAgents?: PlayerContext[];
        transactions?: string[];
    },
    language: SupportedLanguage = 'en',
    newsContext?: string
): PromptContext {
    return {
        language,
        leagueName: snapshot.league.name,
        scoringSettings: snapshot.league.scoringSettings,
        rosterSlots: snapshot.league.rosterSlots,
        myTeam: snapshot.myTeam,
        opponent: snapshot.opponent,
        matchup: snapshot.matchup,
        schedule: snapshot.schedule,
        newsContext,
        draftDetail: snapshot.league.draftDetail,
        positionalRatings: snapshot.league.positionalRatings,
        liveScoring: snapshot.league.liveScoring,
        freeAgents: snapshot.freeAgents,
        transactions: snapshot.transactions,
    };
}

// Default export for convenience
export default getSystemPrompt;
