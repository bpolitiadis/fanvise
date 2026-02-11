import { describe, it, expect } from 'vitest';
import { getConsiglierePrompt } from './consigliere';
import type { PromptContext } from '../types';

describe('Consigliere Anti-Hallucination Rules', () => {
    const mockContext: PromptContext = {
        language: 'en',
        leagueName: 'Test League',
        scoringSettings: {},
        rosterSlots: {},
        myTeam: {
            id: '1',
            name: 'Alpha Team',
            manager: 'Manager A',
            isUserOwned: true,
            roster: []
        },
        newsContext: '- [2026-02-10] [SOURCE: ESPN] [PLAYER: Collier] Fantasy basketball pickups: Collier, Mathurin, Clifford among top players to add'
    };

    it('should explicitly forbid first-name inference for surnames', () => {
        const prompt = getConsiglierePrompt(mockContext);
        expect(prompt).toContain('Do NOT attempt to infer or invent player first names if only surnames are provided');
        expect(prompt).toContain('If context says "Collier", refer to them as "Collier"');
    });

    it('should mandate source attribution with specific examples', () => {
        const prompt = getConsiglierePrompt(mockContext);
        expect(prompt).toContain('SOURCE ATTRIBUTION');
        expect(prompt).toContain('[Per ESPN]');
        expect(prompt).toContain('[Per RotoWire]');
    });

    it('should have corresponding rules in Greek prompt', () => {
        const greekContext = { ...mockContext, language: 'el' as const };
        const prompt = getConsiglierePrompt(greekContext);
        expect(prompt).toContain('ΠΟΛΙΤΙΚΗ ΜΗΔΕΝΙΚΗΣ ΕΙΚΑΣΙΑΣ');
        expect(prompt).toContain('Μην προσπαθήσετε να "μαντέψετε" ή να εφεύρετε μικρά ονόματα παικτών');
        expect(prompt).toContain('ΑΠΟΔΟΣΗ ΠΗΓΩΝ');
        expect(prompt).toContain('[Κατά το ESPN]');
    });
});
