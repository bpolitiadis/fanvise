# Incident: Roster Listed as Free Agents (Wrong Data)

**Date:** 2026-02-23  
**Severity:** High (user-facing wrong advice)  
**Status:** Resolved

## Summary

User reported that the FanVise AI listed players (e.g. Devin Vassell, Jordan Poole, Malik Monk) as "top performers on your roster" when those players were actually **free agents**, not on the user's team. Conversely, the user's actual roster (visible on ESPN) was different.

## Root Causes (Identified)

1. **Cache key collision (defensive fix)**: `fetchMatchupFromEspn` used `unstable_cache` with a static key `['league-service-fetch-matchup']`. While Next.js includes function args in the cache key by default, we now explicitly include `leagueId`, `teamId`, and `seasonId` in the key to guarantee isolation between users/leagues.

2. **LLM conflating roster vs free agents**: The model could list players from `get_free_agents` in the "Roster Overview" section, or invent roster players from prior knowledge, instead of strictly using `get_my_roster` results.

3. **Ambiguous tool response shape**: `get_my_roster` returned a flat array of players without metadata (team name, source). The LLM had no explicit signal that these were "YOUR roster" vs "available players".

## Fixes Applied

| Fix | Location |
|-----|----------|
| Dynamic cache key for matchup fetch | `league.service.ts` — `fetchMatchupFromEspn` now uses `['league-service-fetch-matchup', leagueId, teamId, seasonId]` |
| Structured roster response with teamName + source | `tool-registry.ts` — `get_my_roster` returns `{ teamName, source: "ESPN", roster }` |
| Hard rules in system prompt | `prompts.ts` — "Roster Overview MUST list only get_my_roster.roster; Waiver Recommendations only get_free_agents" |
| Explicit tool descriptions | `tool-registry.ts` — get_my_roster description now says "YOUR TEAM's roster — NOT free agents" |

## Best Practices Going Forward

- **Tool responses**: For tools that return user-specific data (roster, matchup), include `teamName` and `source` so the LLM cannot confuse it with other tools.
- **Cache keys**: Always include all parameters that affect the result in `unstable_cache` keyParts when the function has user/league-scoped side effects.
- **Prompt discipline**: Add explicit "NEVER X in section Y" rules when the LLM has historically conflated two data sources (roster vs free agents).
- **Settings validation**: Ensure `espn_team_id` and `espn_league_id` in user settings match the league the user is viewing. Consider periodic sync from ESPN to validate.
