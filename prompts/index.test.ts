/**
 * Unit tests for Prompt Engine
 * 
 * Tests prompt generation and context validation.
 */

import { describe, it, expect } from 'vitest';
import { getSystemPrompt, createDefaultContext, contextFromSnapshot } from './index';
import type { PromptContext, TeamContext } from './types';

describe('Prompt Engine', () => {
    const baseTeam: TeamContext = {
        id: '1',
        name: 'Alpha Wolves',
        abbrev: 'AW',
        manager: 'John Doe',
        isUserOwned: true,
        roster: [
            {
                id: '101',
                firstName: 'LeBron',
                lastName: 'James',
                fullName: 'LeBron James',
                proTeam: 'LAL',
                position: 'SF',
                injuryStatus: 'ACTIVE',
                isInjured: false,
                avgPoints: 55.5,
                gamesPlayed: 48
            }
        ]
    };

    const baseContext: PromptContext = {
        language: 'en',
        leagueName: 'Office Champions',
        scoringSettings: { PTS: 1, AST: 1.5, REB: 1.2, BLK: 3, STL: 3, TO: -1 },
        rosterSlots: { PG: 1, SG: 1, SF: 1, PF: 1, C: 1, UTIL: 3, BE: 3 },
        myTeam: baseTeam,
    };

    describe('getSystemPrompt', () => {
        it('should generate English prompt when language is en', () => {
            const prompt = getSystemPrompt('consigliere', baseContext);

            expect(prompt).toContain('FanVise');
            expect(prompt).toContain('Alpha Wolves');
            expect(prompt).toContain('John Doe');
            expect(prompt).toContain('Office Champions');
        });

        it('should generate Greek prompt when language is el', () => {
            const greekContext: PromptContext = {
                ...baseContext,
                language: 'el',
            };

            const prompt = getSystemPrompt('consigliere', greekContext);

            expect(prompt).toContain('FanVise');
            expect(prompt).toContain('Η Ομάδα Μου');
            expect(prompt).toContain('Alpha Wolves');
        });

        it('should include scoring settings in prompt', () => {
            const prompt = getSystemPrompt('consigliere', baseContext);

            expect(prompt).toContain('PTS');
            expect(prompt).toContain('AST');
            expect(prompt).toContain('TO: -1');
        });

        it('should include opponent context when provided', () => {
            const contextWithOpponent: PromptContext = {
                ...baseContext,
                opponent: {
                    id: '5',
                    name: 'Beta Bears',
                    abbrev: 'BB',
                    manager: 'Jane Smith',
                },
            };

            const prompt = getSystemPrompt('consigliere', contextWithOpponent);

            expect(prompt).toContain('Beta Bears');
            expect(prompt).toContain('Jane Smith');
        });

        it('should include matchup scores when provided', () => {
            const contextWithMatchup: PromptContext = {
                ...baseContext,
                opponent: {
                    id: '5',
                    name: 'Beta Bears',
                    abbrev: 'BB',
                    manager: 'Jane Smith',
                },
                matchup: {
                    myScore: 450.5,
                    opponentScore: 420.0,
                    differential: 30.5,
                    status: 'in_progress',
                },
            };

            const prompt = getSystemPrompt('consigliere', contextWithMatchup);

            expect(prompt).toContain('450.5');
            expect(prompt).toContain('420');
            expect(prompt).toContain('+30.5');
        });

        it('should include schedule density when provided', () => {
            const contextWithSchedule: PromptContext = {
                ...baseContext,
                schedule: {
                    myGamesPlayed: 5,
                    myGamesRemaining: 8,
                    opponentGamesPlayed: 6,
                    opponentGamesRemaining: 5,
                },
            };

            const prompt = getSystemPrompt('consigliere', contextWithSchedule);

            expect(prompt).toContain('8 remaining');
            expect(prompt).toContain('Volume Advantage');
        });

        it('should include advanced intelligence blocks when provided', () => {
            const contextWithIntel: PromptContext = {
                ...baseContext,
                draftDetail: { picks: [{ playerId: '1', roundId: 1 }] },
                positionalRatings: { positionalRatings: { PG: { rating: 85 } } },
                pendingTransactions: [{ id: '1', status: 'PENDING' }],
            };

            const prompt = getSystemPrompt('consigliere', contextWithIntel);

            expect(prompt).toContain('League Intelligence');
            expect(prompt).toContain('Draft context is available');
            expect(prompt).toContain('PG: 85 rating');
            expect(prompt).toContain('1 active transactions pending');
            expect(prompt).toContain('Performance Trends');
        });

        it('should include player performance metrics in roster', () => {
            const prompt = getSystemPrompt('consigliere', baseContext);
            expect(prompt).toContain('AVG: 55.5');
            expect(prompt).toContain('GP: 48');
        });

        it('should indicate user ownership status', () => {
            const ownedContext = { ...baseContext };
            const notOwnedContext: PromptContext = {
                ...baseContext,
                myTeam: { ...baseTeam, isUserOwned: false },
            };

            const ownedPrompt = getSystemPrompt('consigliere', ownedContext);
            const notOwnedPrompt = getSystemPrompt('consigliere', notOwnedContext);

            expect(ownedPrompt).toContain('USER\'S OWN TEAM');
            expect(notOwnedPrompt).toContain('Viewing as opponent');
        });

        it('should throw on invalid context', () => {
            const invalidContext = {
                language: 'invalid' as any,
                leagueName: 'Test',
                scoringSettings: {},
                rosterSlots: {},
                myTeam: baseTeam,
            };

            expect(() => getSystemPrompt('consigliere', invalidContext)).toThrow();
        });
    });

    describe('createDefaultContext', () => {
        it('should create valid default context', () => {
            const context = createDefaultContext();

            expect(context.language).toBe('en');
            expect(context.leagueName).toBe('Fantasy League');
            expect(context.myTeam.name).toBe('My Team');
        });

        it('should merge partial context with defaults', () => {
            const context = createDefaultContext({
                leagueName: 'Custom League',
                language: 'el',
            });

            expect(context.language).toBe('el');
            expect(context.leagueName).toBe('Custom League');
            expect(context.myTeam.name).toBe('My Team'); // From defaults
        });
    });

    describe('contextFromSnapshot', () => {
        it('should convert snapshot to PromptContext', () => {
            const snapshot = {
                league: {
                    name: 'Test League',
                    scoringSettings: { PTS: 1 },
                    rosterSlots: { PG: 1 },
                },
                myTeam: baseTeam,
            };

            const context = contextFromSnapshot(snapshot, 'en');

            expect(context.leagueName).toBe('Test League');
            expect(context.language).toBe('en');
            expect(context.myTeam.id).toBe('1');
        });

        it('should include news context when provided', () => {
            const snapshot = {
                league: {
                    name: 'Test League',
                    scoringSettings: {},
                    rosterSlots: {},
                },
                myTeam: baseTeam,
            };

            const context = contextFromSnapshot(
                snapshot,
                'en',
                'Breaking: Star player ruled out for 2 weeks'
            );

            expect(context.newsContext).toContain('Star player ruled out');
        });
    });
});
