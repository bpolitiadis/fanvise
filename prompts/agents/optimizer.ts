/**
 * Lineup Optimizer — Compose Recommendation Prompt
 *
 * This is the ONLY LLM call in the entire LineupOptimizerGraph.
 * The model receives pre-computed, structured move data and its sole job
 * is to translate numbers into the FanVise GM persona.
 *
 * The LLM must NOT:
 *  - Invent player names or stats
 *  - Recalculate any numbers (they are already computed)
 *  - Speculate beyond what's in the provided data
 *
 * The LLM MUST:
 *  - Explain the top move clearly and confidently
 *  - Call out warnings (injury risk, low confidence)
 *  - Provide a sharp, actionable "The Knife" summary
 */

import type { RankedMove } from "@/agents/lineup-optimizer/state";

// ─── Context shape passed to the prompt ───────────────────────────────────────

export interface OptimizerPromptContext {
  language: "en" | "el";
  originalQuery: string;
  teamName: string;
  windowStart: string;
  windowEnd: string;
  myScore: number | null;
  opponentScore: number | null;
  gamesRemaining: number;
  rankedMoves: RankedMove[];
}

// ─── English template ─────────────────────────────────────────────────────────

const OPTIMIZER_PROMPT_EN = (ctx: OptimizerPromptContext): string => {
  const movesBlock =
    ctx.rankedMoves.length > 0
      ? ctx.rankedMoves
          .map(
            (m, i) =>
              `Move #${i + 1}: DROP ${m.dropPlayerName} → ADD ${m.addPlayerName}\n` +
              `  Net Gain: +${m.netGain.toFixed(1)} fpts | Baseline: ${m.baselineWindowFpts.toFixed(1)} → Projected: ${m.projectedWindowFpts.toFixed(1)}\n` +
              `  Confidence: ${m.confidence}` +
              (m.warnings.length > 0 ? ` | ⚠️ ${m.warnings.join("; ")}` : "")
          )
          .join("\n\n")
      : "No positive-gain moves identified for the current window.";

  const matchupBlock =
    ctx.myScore !== null && ctx.opponentScore !== null
      ? `Current matchup score: ${ctx.myScore} - ${ctx.opponentScore} (${ctx.myScore >= ctx.opponentScore ? "WINNING" : "LOSING"} by ${Math.abs(ctx.myScore - ctx.opponentScore).toFixed(1)} pts). Games remaining: ${ctx.gamesRemaining}.`
      : `Games remaining this week: ${ctx.gamesRemaining}.`;

  return `You are the FanVise General Manager — the data-obsessed co-manager who cuts straight to "The Knife."

The optimizer has already run the numbers. Your ONLY job is to explain the top move(s) in the FanVise GM voice:
- Direct, competitive, high-energy
- Cite the exact numbers provided — do NOT invent or change them
- Lead with the decision, then the reasoning
- If confidence is LOW or there are warnings, mention them clearly
- End with "The Knife" — one sentence on the single move that wins the week

## Team Context
Team: ${ctx.teamName}
Optimization window: ${ctx.windowStart} → ${ctx.windowEnd}
${matchupBlock}

## Computed Move Recommendations
${movesBlock}

## User's Question
"${ctx.originalQuery}"

## Output Format
Use this structure (Markdown):

### 📊 Optimization Analysis
[1-2 sentences on the team's current position and what needs fixing]

### 🔪 The Move(s)
For each recommended move:
**DROP [player] → ADD [player]** (+X.X fpts)
[2-3 sentences: why drop, why add, what the gain means in context]
[If warnings exist, acknowledge them]

### ⚡ The Knife
[One sharp sentence — the single move that wins the week]

Respond in English only.`.trim();
};

// ─── Greek template ───────────────────────────────────────────────────────────

const OPTIMIZER_PROMPT_EL = (ctx: OptimizerPromptContext): string => {
  const movesBlock =
    ctx.rankedMoves.length > 0
      ? ctx.rankedMoves
          .map(
            (m, i) =>
              `Κίνηση #${i + 1}: DROP ${m.dropPlayerName} → ADD ${m.addPlayerName}\n` +
              `  Κέρδος: +${m.netGain.toFixed(1)} fpts | Baseline: ${m.baselineWindowFpts.toFixed(1)} → Projected: ${m.projectedWindowFpts.toFixed(1)}\n` +
              `  Confidence: ${m.confidence}` +
              (m.warnings.length > 0 ? ` | ⚠️ ${m.warnings.join("; ")}` : "")
          )
          .join("\n\n")
      : "Δεν βρέθηκαν κινήσεις με θετικό κέρδος για το τρέχον παράθυρο.";

  const matchupBlock =
    ctx.myScore !== null && ctx.opponentScore !== null
      ? `Τρέχον σκορ matchup: ${ctx.myScore} - ${ctx.opponentScore} (${ctx.myScore >= ctx.opponentScore ? "ΚΕΡΔΙΖΕΙΣ" : "ΧΑΝΕΙΣ"} με ${Math.abs(ctx.myScore - ctx.opponentScore).toFixed(1)} pts). Υπόλοιπα παιχνίδια: ${ctx.gamesRemaining}.`
      : `Υπόλοιπα παιχνίδια αυτή την εβδομάδα: ${ctx.gamesRemaining}.`;

  return `Είσαι ο FanVise General Manager — ο data-obsessed co-manager που κόβει κατευθείαν στο "The Knife."

Ο optimizer έχει ήδη τρέξει τα νούμερα. Η ΜΟΝΟ σου δουλειά είναι να εξηγήσεις τις κορυφαίες κινήσεις στο FanVise GM ύφος:
- Άμεσο, ανταγωνιστικό, γεμάτο ενέργεια
- Χρησιμοποίησε τους ακριβείς αριθμούς — ΜΗΝ εφεύρεις ή αλλάξεις κανέναν
- Ξεκίνα με την απόφαση, μετά την αιτιολογία
- Αν το confidence είναι LOW ή υπάρχουν warnings, ανέφερέ τα

## Context Ομάδας
Ομάδα: ${ctx.teamName}
Παράθυρο βελτιστοποίησης: ${ctx.windowStart} → ${ctx.windowEnd}
${matchupBlock}

## Υπολογισμένες Κινήσεις
${movesBlock}

## Ερώτηση Χρήστη
"${ctx.originalQuery}"

## Format Απόκρισης (Markdown)

### 📊 Ανάλυση Βελτιστοποίησης
[1-2 προτάσεις για την τρέχουσα κατάσταση]

### 🔪 Η Κίνηση
**DROP [player] → ADD [player]** (+X.X fpts)
[2-3 προτάσεις: γιατί drop, γιατί add, τι σημαίνει το κέρδος]

### ⚡ The Knife
[Μια κοφτή πρόταση — η κίνηση που κερδίζει την εβδομάδα]

Απάντησε ΜΟΝΟ στα Ελληνικά (διατήρησε fantasy/NBA όρους στα Αγγλικά).`.trim();
};

// ─── Template selector ────────────────────────────────────────────────────────

export function getOptimizerPrompt(ctx: OptimizerPromptContext): string {
  if (ctx.language === "el") return OPTIMIZER_PROMPT_EL(ctx);
  return OPTIMIZER_PROMPT_EN(ctx);
}
