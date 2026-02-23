# Agent Test Findings — Plan vs Actual Response

**Date:** 2026-02-23  
**Issue:** User receives "plan" (JSON/tool descriptions) instead of actual roster/audit data

## Test Results Summary

Ran `scripts/test-agent.ts` against `/api/agent/chat` with:
- Team ID: 13, League ID: 13001 (from env)
- Both eval mode (JSON) and streaming mode

### Findings

1. **Eval mode returns correct data** — Team audit queries returned real roster (Devin Booker, Tyrese Maxey, Nikola Vucevic, etc.) with 2 tool calls. No plan-as-text reproduced in test runs.

2. **Intent misclassification** — "Perform a comprehensive audit of my team and roster" was classified as `general_advice` instead of `lineup_optimization`. This prevented `tool_choice: "any"` from being applied (we only force when intent is lineup_optimization, matchup_analysis, etc.).

3. **Settings side** — With explicit activeTeamId + activeLeagueId, perspective resolves correctly. Empty strings are normalized to undefined. The issue is not from Settings page configuration when values are present.

4. **USE_LOCAL_AI** — When `USE_LOCAL_AI=true` (Ollama), we never pass `tool_choice`. When false (Gemini), we now force tools for audit-like queries even when intent is wrong, via content-based fallback.

## Root Causes Identified

| Cause | Impact | Fix |
|-------|--------|-----|
| Intent classifier returns `general_advice` for audit | tool_choice not forced for Gemini | Improved classifier prompt; added query-based fallback |
| Model may output "lineup optimization" (with space) | Intent match fails (we check "lineup_optimization") | Normalize spaces to underscores before matching |
| Audit query not in classifier examples | Model doesn't recognize audit → lineup_optimization | Added "audit", "roster overview", "comprehensive" to lineup_optimization description |

## Fixes Applied

1. **Intent classifier prompt** — Expanded `lineup_optimization` to explicitly include "audit my team", "overview of my roster", "comprehensive audit".

2. **Intent matching** — Normalize classifier output (`lineup optimization` → `lineup_optimization`) before matching.

3. **Query-based tool forcing** — When query contains "audit", "roster", "overview", "standings", "matchup", "my team", "who's on" AND we have team context, force `tool_choice: "any"` for Gemini even if intent is general_advice.

4. **Plan detection fallback** — If output looks like a plan (JSON with tool names), replace with retry message.

## How to Test

```bash
# Run full agent test (Ollama)
USE_LOCAL_AI=true npx tsx scripts/test-agent.ts

# Run with Gemini
USE_LOCAL_AI=false npx tsx scripts/test-agent.ts
```

## Settings Verification

If you still see plan responses:

1. **Check Agent mode** — Toggle must be ON (purple) before sending.
2. **Check ESPN IDs** — Settings → ESPN League ID and Team ID must match your league URL (e.g. `espn.com/fantasy/basketball/team?leagueId=13001&teamId=13`).
3. **Check USE_LOCAL_AI** — With Ollama, tool forcing is not applied. Set `USE_LOCAL_AI=false` in `.env.local` to use Gemini + forced tools for audits.
4. **Retry** — If you get the fallback "Please try again" message, the plan was detected; retrying often succeeds.
