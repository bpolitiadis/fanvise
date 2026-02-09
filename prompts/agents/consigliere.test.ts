import { describe, it, expect } from 'vitest';
import { getConsiglierePrompt } from './consigliere';
import type { PromptContext } from '../types';

describe('Consigliere Prompt', () => {
    const mockContext: PromptContext = {
        language: 'en',
        leagueName: 'Test League',
        scoringSettings: { '1': 2, '2': 1 },
        rosterSlots: { '0': 1, '1': 1 },
        myTeam: {
            id: '1',
            name: 'Alpha Team',
            manager: 'Manager A',
            isUserOwned: true,
            roster: [
                { id: '101', firstName: 'John', lastName: 'Doe', fullName: 'John Doe', position: 'PG', proTeam: 'LAL' }
            ]
        },
        newsContext: '- [2026-02-10] Injury Update: John Doe is GTD. http://espn.com/news/1'
    };

    it('should include the Role Definition', () => {
        const prompt = getConsiglierePrompt(mockContext);
        expect(prompt).toContain('# ROLE DEFINITION');
        expect(prompt).toContain('FanVise Strategic Consigliere');
    });

    it('should include Source Grounding Rules', () => {
        const prompt = getConsiglierePrompt(mockContext);
        expect(prompt).toContain('# SOURCE GROUNDING RULES (CRITICAL)');
        expect(prompt).toContain('TRUTH ANCHORING');
    });

    it('should include the Link Mandate', () => {
        const prompt = getConsiglierePrompt(mockContext);
        expect(prompt).toContain('LINK MANDATE');
    });

    it('should include context data', () => {
        const prompt = getConsiglierePrompt(mockContext);
        expect(prompt).toContain('Alpha Team');
        expect(prompt).toContain('John Doe');
        expect(prompt).toContain('http://espn.com/news/1');
    });

    it('should include the Verification Step', () => {
        const prompt = getConsiglierePrompt(mockContext);
        expect(prompt).toContain('# VERIFICATION STEP (INTERNAL MONOLOGUE)');
    });

    it('should generate Greek prompt when requested', () => {
        const greekContext = { ...mockContext, language: 'el' as const };
        const prompt = getConsiglierePrompt(greekContext);
        expect(prompt).toContain('# ΟΡΙΣΜΟΣ ΡΟΛΟΥ');
        expect(prompt).toContain('ΚΑΝΟΝΕΣ ΤΕΚΜΗΡΙΩΣΗΣ');
    });
});
