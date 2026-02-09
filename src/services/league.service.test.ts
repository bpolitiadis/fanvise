/**
 * Unit tests for League Service
 * 
 * Tests the scoring calculation logic to ensure AI receives accurate data.
 */

import { describe, it, expect } from 'vitest';
import { calculateFantasyPoints } from './league.service';

describe('League Service', () => {
    describe('calculateFantasyPoints', () => {
        it('should calculate points correctly with standard scoring', () => {
            const stats = {
                PTS: 25,
                AST: 8,
                REB: 10,
                BLK: 2,
                STL: 1,
                TO: 3,
            };

            const scoringSettings = {
                PTS: 1,
                AST: 1.5,
                REB: 1.2,
                BLK: 3,
                STL: 3,
                TO: -1,
            };

            // Expected: 25*1 + 8*1.5 + 10*1.2 + 2*3 + 1*3 + 3*(-1)
            // = 25 + 12 + 12 + 6 + 3 - 3 = 55
            const result = calculateFantasyPoints(stats, scoringSettings);
            expect(result).toBe(55);
        });

        it('should handle empty stats', () => {
            const result = calculateFantasyPoints({}, { PTS: 1 });
            expect(result).toBe(0);
        });

        it('should handle empty scoring settings', () => {
            const result = calculateFantasyPoints({ PTS: 25 }, {});
            expect(result).toBe(0);
        });

        it('should ignore stats not in scoring settings', () => {
            const stats = {
                PTS: 20,
                OREB: 5, // Not in scoring
                MIN: 35, // Not in scoring
            };

            const scoringSettings = {
                PTS: 1,
                AST: 1.5,
            };

            const result = calculateFantasyPoints(stats, scoringSettings);
            expect(result).toBe(20);
        });

        it('should handle negative scoring values correctly', () => {
            const stats = {
                PTS: 10,
                TO: 5,
                PF: 3,
            };

            const scoringSettings = {
                PTS: 1,
                TO: -2, // Heavy penalty
                PF: -0.5,
            };

            // Expected: 10*1 + 5*(-2) + 3*(-0.5) = 10 - 10 - 1.5 = -1.5
            const result = calculateFantasyPoints(stats, scoringSettings);
            expect(result).toBe(-1.5);
        });

        it('should round to 2 decimal places', () => {
            const stats = {
                PTS: 7,
                AST: 3,
            };

            const scoringSettings = {
                PTS: 0.333,
                AST: 0.666,
            };

            // Expected: 7*0.333 + 3*0.666 = 2.331 + 1.998 = 4.329
            const result = calculateFantasyPoints(stats, scoringSettings);
            expect(result).toBe(4.33);
        });

        it('should handle zero values', () => {
            const stats = {
                PTS: 0,
                AST: 0,
                TO: 0,
            };

            const scoringSettings = {
                PTS: 1,
                AST: 1.5,
                TO: -1,
            };

            const result = calculateFantasyPoints(stats, scoringSettings);
            expect(result).toBe(0);
        });

        it('should handle ESPN-style scoring settings', () => {
            // Real ESPN H2H Points scoring example
            const stats = {
                PTS: 30,    // LeBron-type game
                REB: 8,
                AST: 12,
                STL: 2,
                BLK: 1,
                TO: 4,
                FGM: 11,
                FGA: 22,
                FTM: 6,
                FTA: 8,
                '3PTM': 2,
            };

            const scoringSettings = {
                PTS: 1,
                REB: 1.2,
                AST: 1.5,
                STL: 3,
                BLK: 3,
                TO: -1,
                FGM: 0.5,
                FGA: -0.5,
                FTM: 1,
                FTA: -0.5,
                '3PTM': 0.5,
            };

            // Expected:
            // 30*1 + 8*1.2 + 12*1.5 + 2*3 + 1*3 + 4*(-1) +
            // 11*0.5 + 22*(-0.5) + 6*1 + 8*(-0.5) + 2*0.5
            // = 30 + 9.6 + 18 + 6 + 3 - 4 + 5.5 - 11 + 6 - 4 + 1 = 60.1
            const result = calculateFantasyPoints(stats, scoringSettings);
            expect(result).toBe(60.1);
        });
    });
});
