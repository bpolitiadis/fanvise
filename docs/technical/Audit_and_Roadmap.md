# Audit Findings & Project Roadmap

This document summarizes the current state of the FanVise project, identifies technical debt, and outlines the remaining tasks to reach the MVP defined in the PRD.

## Technical Audit

### 1. Development Shortcuts & Technical Debt
- **Mock Data in Production UI**: The `src/app/page.tsx` (Dashboard) still uses `generateMockSchedule` and hardcoded stat leaders. These should be replaced with real data from the `roster_slots` and `stat_aggregate` tables.
- ~~**Redundant Database Logic**: There are several `_temp` files (e.g., `src/lib/db/leagues.ts_temp`) and overlapping logic between `src/lib/db` and `src/lib/services`. These need consolidation.~~ **RESOLVED**: Removed `src/lib/db/` and `src/lib/agents/`. Logic consolidated into `src/services/`.
- **Error Handling**: While retry logic exists in the Orchestrator, the UI components (like `PerspectiveProvider`) need more robust error boundaries to handle Supabase or ESPN API failures gracefully.
- **Environment Variable Sprawl**: Ensure all environment variables are documented and validated at startup (e.g., `OLLAMA_URL`, `NEXT_PUBLIC_ESPN_SPORT`).

### 2. Duplicate Implementations
- ~~**League Management**: Logic for "switching perspective" exists in both the `PerspectiveContext` and partially in the `Chat API` route. This should be unified into a single service layer.~~ **RESOLVED**: All league logic now in `src/services/league.service.ts`.
- ~~**ESPN Client**: Partial implementations of ESPN scraping logic are scattered between `src/lib/espn` and some older route files.~~ **RESOLVED**: ESPN client is now the single source in `src/lib/espn/client.ts`.


## Project Roadmap (TODO List)

### Priority 1: Core Feature Completion
- [x] **Player Intelligence (Free Agents)**: Enriched `PlayerContext` with Season Outlook and News.
- [x] **Player Intelligence (Rosters)**: Expands Outlook/News coverage to `My Team` and `Opponent` rosters for better Start/Sit context.
- [ ] **The Optimizer Engine**: Implement the "Start/Sit" & "Lineup Optimization" logic (Phase 2).
- [ ] **Weekly Vibe Check**: Create the automated reporting system (Daily Brief / Weekly Trash Talk) via Next.js Cron Jobs.
- [ ] **Intelligent Widgets**: Develop more shadcn-based components (Player Cards, Stat Grids) for the AI to render in the chat stream.

### Priority 2: Polish & UX
- [ ] **Smooth Localization**: Fully implement `next-intl` across all UI labels (currently only documented as a principle).
- [ ] **Performance Audit**: Optimize the RAG embedding search (ensure indexes are correct on the `vector` column).
- [ ] **Mobile Optimization**: Refine the responsive behavior of the Dashboard grid.

## Best Practices Recommendations
1. **Centralized Service Layer**: Move all business logic (RAG search, perspective switching, ESPN data normalization) into a `src/lib/core` directory to avoid duplication.
2. **Schema Rotations**: Implement Supabase migrations for all table changes instead of manual dashboard edits.
3. **Type Safety**: Enforce stricter TypeScript interfaces for the ESPN API responses to avoid `any` in the `Chat API` route.
