# FanVise Architecture Review (Next.js 16 + Supabase)

## Executive Verdict
Backend architecture is functional but not production-hard yet. Biggest risks are:
- authorization boundary bypass in league context loading,
- blocking orchestration in `IntelligenceService`,
- excessive `any`/untyped ESPN payload handling,
- client-heavy data fetching where Server Components/cached functions should be used.

---

## 1) Code Smell Audit

### A. Monolithic Functions (especially `IntelligenceService` / `LeagueService`)

- `generateStrategicResponse` mixes 4 responsibilities: retrieval, snapshot orchestration, prompt building, and stream generation.

```ts
export async function generateStrategicResponse(
  history: ChatMessage[],
  currentMessage: string,
  options: IntelligenceOptions = {}
) {
  // 1) RAG retrieval
  // 2) snapshot + prompt construction
  // 3) fallback logic
  // 4) stream generation
}
```

- `buildIntelligenceSnapshot` is a god-function: DB read, ESPN network calls, schedule math, free-agent filtering, output shaping.

```ts
export async function buildIntelligenceSnapshot(
  leagueId: string,
  teamId: string
): Promise<IntelligenceSnapshot> {
  // fetch league
  // fetch matchup
  // derive schedule
  // fetch free agents
  // compose snapshot
}
```

### B. Critical Integrity/Security Finding

- `buildIntelligenceSnapshot` reads with `createAdminClient()` and accepts client-provided `activeLeagueId/activeTeamId` from `/api/chat` without ownership verification.
- This can expose other leagues if IDs are known.

```ts
// /api/chat/route.ts
const { messages, activeTeamId, activeLeagueId } = body;
const streamResult = await generateStrategicResponse(
  history,
  currentMessageContent,
  { activeTeamId, activeLeagueId, language }
);
```

```ts
// league.service.ts
async function fetchLeague(leagueId: string): Promise<DbLeague | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("leagues")
    .select("*")
    .eq("league_id", leagueId)
    .single();
}
```

### C. Blocking / correctness issues

- Bug in matchup fallback path: fallback is computed but not assigned; code continues using `currentMatchup`.

```ts
if (!currentMatchup) {
  const fallbackMatchup = matchupData.schedule.find((m: any) => ...);
  if (!fallbackMatchup) return null;
}
const isHome = currentMatchup.home?.teamId === teamIdNum;
```

- Sequential blocking in orchestrator: `searchNews` completes before snapshot starts; these are independent and should run in parallel.

```ts
const newsItems = await searchNews(currentMessage);
...
const snapshot = await buildIntelligenceSnapshot(activeLeagueId, activeTeamId);
```

### D. Prop Drilling / state management

- No severe prop drilling (context usage is generally good), but:
  - `PerspectiveProvider` is a fat global context (team, league, loading, error, switching) causing broad rerenders.
  - Supabase browser client is recreated per render in provider (`createClient()` called in component body), increasing effect churn risk.

```ts
export const PerspectiveProvider = ({ children }: { children: ReactNode }) => {
  ...
  const supabase = createClient();
  const fetchContextData = useCallback(async (...) => { ... }, [supabase]);
}
```

### E. Dead code / legacy patterns

- Legacy client fetching via `useEffect` in `src/app/page.tsx` for primary data instead of Server Components.
- Unused/legacy artifacts:
  - unused import: `createClient` in `league.service.ts`
  - unused const: `supabase` in `chat-history-context.tsx`
  - unused import: `ESPN_PRO_TEAM_MAP` in `schedule.service.ts`
- Multiple explicit `any` in core services (`intelligence`, `league`, `news`, `ai`, `transaction`).

---

## 2) Performance Optimization

### A. RAG Retrieval workflow: currently blocking

Current flow in `IntelligenceService` is serial:
1) embed + vector search (`searchNews`)
2) DB+ESPN+schedule+free-agent snapshot
3) prompt compile
4) AI stream starts

Recommendation (parallel + optimistic):
- Start retrieval and snapshot concurrently with `Promise.allSettled`.
- Build prompt from whichever completes first + fallback context.
- For eval mode, avoid duplicate `searchNews` (currently called once in service and again in route).

### B. ESPN + Supabase caching strategy (`unstable_cache`)

Use cache wrappers around read-heavy calls:
- `getLeagueByIdCached(leagueId)` -> revalidate 60s, tag `league:${leagueId}`
- `getMatchupCached(leagueId, teamId, seasonId, period)` -> revalidate 30-60s, tag `matchup:${leagueId}:${period}`
- `getTopFreeAgentsCached(leagueId, seasonId)` -> revalidate 300s, tag `freeagents:${leagueId}`
- `getGamesInRangeCached(seasonId, start, end)` -> revalidate 6-24h, tag `schedule:${seasonId}`

Also add per-request dedupe (`cache`) for repeated same-call reads during one request.

### C. Additional hot spots

- `calculateScheduleDensity` currently computes player games with repeated `filter` loops; pre-index games by `proTeamId` map to reduce complexity.
- Move dashboard data loading to Server Components to reduce client boot + network waterfalls.

---

## 3) Refactoring Roadmap

### Before vs After (`IntelligenceService` modularization)

#### Before (current monolith)

```ts
export async function generateStrategicResponse(...) {
  const newsItems = await searchNews(currentMessage);
  ...
  const snapshot = await buildIntelligenceSnapshot(activeLeagueId, activeTeamId);
  ...
  return generateStreamingResponse(history, currentMessage, { systemInstruction });
}
```

#### After (modular + testable)

```ts
type IntelligenceDeps = {
  retrieveNews: (q: string) => Promise<NewsItem[]>;
  buildSnapshot: (leagueId: string, teamId: string) => Promise<IntelligenceSnapshot>;
  buildPrompt: (input: PromptInput) => string;
  stream: typeof generateStreamingResponse;
};

export const createIntelligenceOrchestrator = (deps: IntelligenceDeps) => {
  const assembleContext = async (msg: string, opts: IntelligenceOptions) => {
    const [newsRes, snapshotRes] = await Promise.allSettled([
      deps.retrieveNews(msg),
      opts.activeLeagueId && opts.activeTeamId
        ? deps.buildSnapshot(opts.activeLeagueId, opts.activeTeamId)
        : Promise.resolve(null),
    ]);

    return { newsRes, snapshotRes };
  };

  return async (history: ChatMessage[], currentMessage: string, opts: IntelligenceOptions) => {
    const context = await assembleContext(currentMessage, opts);
    const systemInstruction = deps.buildPrompt({ context, language: opts.language ?? "en" });
    return deps.stream(history, currentMessage, { systemInstruction });
  };
};
```

This gives:
- unit-testable orchestration (mock deps),
- isolated fallback policy,
- easier perf instrumentation,
- no hidden side-effects in one mega function.

### Suggested directory restructuring (to reduce clutter)

- `src/modules/intelligence/`
  - `orchestrator.ts`
  - `prompt-builder.ts`
  - `retrieval.ts`
  - `types.ts`
- `src/modules/league/`
  - `snapshot-builder.ts`
  - `espn-gateway.ts`
  - `schedule-density.ts`
  - `free-agents.ts`
- `src/server/data/` (Supabase reads/writes only)
- `src/app/(dashboard)/...` pages as Server Components by default
- `src/app/actions/` for explicit Server Actions

---

## Priority Fix Order (recommended)

- **P0:** enforce auth/ownership check before admin snapshot reads.
- **P0:** fix `currentMatchup` fallback bug.
- **P1:** parallelize RAG + snapshot and remove duplicate retrieval in eval mode.
- **P1:** introduce cached wrappers for ESPN/snapshot reads.
- **P2:** split `IntelligenceService` and `LeagueService` into focused modules.
- **P2:** remove `any` from core path (`intelligence`, `league`, `ai`, `news`).

## Implementation Status (2026-02-13)

- [x] **P0:** auth/ownership guard enforced before scoped league snapshot access.
- [x] **P0:** `currentMatchup` fallback assignment bug fixed.
- [x] **P1:** RAG + snapshot execution parallelized; eval-mode duplicate retrieval removed.
- [x] **P1:** cache wrappers added for league reads, matchup fetches, free-agent queries, and schedule window reads.
- [ ] **P2:** service modular decomposition (`intelligence` and `league`) still pending.
- [ ] **P2:** full `any` elimination across remaining services still pending.
