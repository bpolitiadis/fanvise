# System Prompts & AI Personality

The quality of FanVise's advice depends on the precision of the instructions provided to the LLM. 

## Architecture Overview

FanVise uses a **Centralized Prompt Engine** located at `/prompts`. This architecture allows prompt engineers to iterate on AI behavior without touching application logic.

### Directory Structure

```text
/prompts                          # Centralized prompt repository
├── index.ts                      # Main exports & getSystemPrompt API
├── types.ts                      # Shared types & Zod schemas
├── index.test.ts                 # Unit tests
└── agents/
    └── orchestrator.ts           # FanVise Strategist prompt templates

/src/services                     # Business logic layer
├── ai.service.ts                 # Gemini/Ollama API wrapper
├── league.service.ts             # Intelligence Snapshot builder
└── league.service.test.ts        # Scoring calculation tests
```

### Key Components

1. **`getSystemPrompt(agentName, context)`** - Main API for generating prompts
2. **`buildIntelligenceSnapshot(leagueId, teamId)`** - Aggregates all context data
3. **`contextFromSnapshot(snapshot, language, news)`** - Converts snapshot to prompt context

## The "Data-Freak Friend" Persona (FanVise Strategist)

The AI acts as a "strategic partner"—a data-obsessed friend who lives for stats and doesn't mind a bit of competitive trash talk. It avoids "robot speak" in favor of high-energy, informal, and expert-level communication typical of a fantasy basketball group chat.

### Persona Instructions:
- **Tone**: Informal, high-energy, competitive, trash-talking.
- **Perspective**: Always analyze from the user's active team viewpoint, looking for "The Knife" move to win the week.
- **Data Reliance**: Prioritize the injected context (Scoring Rules, Matchup Scores) over general knowledge. Trash talk must be rooted in provided data.

## Prompt Context (PromptContext Interface)

The system prompt is dynamically generated using a structured `PromptContext`:

```typescript
interface PromptContext {
  language: 'en' | 'el';           // English or Greek
  leagueName: string;
  scoringSettings: Record<string, number>;
  rosterSlots: Record<string, number>;
  myTeam: TeamContext;
  opponent?: TeamContext;
  matchup?: MatchupContext;
  schedule?: ScheduleContext;
  newsContext?: string;
}
```

### Context Blocks

1. **Identity Block**: "You are FanVise, a data-obsessed NBA fanatic and the user's trash-talking, stat-crunching best friend."
2. **Perspective Block**: Team name, manager, ownership status, record
3. **League Block**: Scoring settings, roster configuration
4. **Matchup Block**: Current scores, opponent info, differential
5. **Schedule Block**: Games played/remaining (volume advantage detection)
6. **News Block**: RAG-retrieved news articles

### Constraint Block
- "Always prioritize specific scoring settings."
- "If matchup in progress, reference current scores."
- "Use provided news context to inform player status."
- "If information is missing, acknowledge it based on available data."

### Streaming Rules Block
- "NEVER recommend a player already listed in 'My Roster' or 'Opponent Roster'."
- "NEVER recommend a player listed as 'OUT' or 'Injured'."
- "If no suitable players, state: 'No validated streaming options available at this time.'"

## Localization (Babelfish Protocol)

The system supports English and Greek through dual prompt templates:

- **English (`en`)**: Default language
- **Greek (`el`)**: Full translation with NBA terms preserved

The language is selected via the `language` field in `PromptContext`:

```typescript
import { getSystemPrompt } from '@/prompts';

const prompt = getSystemPrompt('orchestrator', {
  language: 'el', // Greek
  leagueName: 'Office Champions',
  // ... rest of context
});
```

### Key Principle
Technical NBA terminology (e.g., "Box Score", "Waiver Wire", "Trade", "Drop") remains in English even in Greek prompts for clarity and universal understanding.

## Usage Example

```typescript
// In src/services/intelligence.service.ts
import { getSystemPrompt, contextFromSnapshot } from '@/prompts';
import { buildIntelligenceSnapshot } from '@/services/league.service';
import { generateStreamingResponse } from '@/services/ai.service';

// ... inside generateStrategicResponse ...

// Build comprehensive context
const snapshot = await buildIntelligenceSnapshot(leagueId, teamId);

// Generate prompt
const systemInstruction = getSystemPrompt('orchestrator', 
  contextFromSnapshot(snapshot, userLanguage, newsContext)
);

// Use with AI service
const response = await generateStreamingResponse(
  history, 
  currentMessage, 
  { systemInstruction }
);
```

## Adding New Agents

To add a new agent persona:

1. Create a new file in `/prompts/agents/`:
   ```typescript
   // prompts/agents/strategist.ts
   export function getStrategistPrompt(context: PromptContext): string {
     // Template implementation
   }
   ```

2. Register in `/prompts/index.ts`:
   ```typescript
   case 'strategist':
     return getStrategistPrompt(context);
   ```

3. Update the `AgentName` type in `/prompts/types.ts`:
   ```typescript
   export type AgentName = 'orchestrator' | 'strategist';
   ```

## Testing

Run prompt engine tests:
```bash
pnpm test prompts/index.test.ts
```

Run scoring calculation tests:
```bash
pnpm test src/services/league.service.test.ts
```

Run all tests:
```bash
pnpm test
```
