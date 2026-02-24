# Changelog

All notable changes to FanVise are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added — 2026-02-24

- **CHANGELOG.md** — Project changelog initialized (24 Feb 2026).
- **docs/REVIEW_2026-02-24.md** — Senior dev review of uncommitted changes, stability assessment, and logical commit breakdown.
- **Settings** — User settings page with ESPN League/Team IDs, Gemini API key, news source preferences. Per-user config with DB → env fallback.
- **LangGraph agents** — Supervisor agent with tool routing; Player Research agent (live ESPN status + news). `/api/agent/chat` endpoint.
- **Chat mode toggle** — Switch between Classic (single-pass RAG) and Agent (Supervisor) mode. Toaster notifications.
- **News enhancements** — ESPN full article fetch, `news_sources` catalog, `user_news_preferences`, `full_content` column, `news:stats` script.
- **Player game logs** — ESPN `getPlayerGameLog`, `game-log.service`, `player_game_logs` table with cache-on-read.
- **Dependencies** — `@langchain/langgraph`, `@langchain/google-genai`, `@langchain/ollama`, `react-hook-form`, `sonner`, Radix form/label/separator/switch.

### Fixed — 2026-02-24

- **League cache key** — `unstable_cache` now includes `leagueId`, `teamId`, `seasonId` to prevent cross-user roster leakage.
- **Perspective auth** — Authenticated users resolve team from `user_leagues` or `user_settings`; no env fallback for wrong teams.

### Added — Auth Flow Refactor (2026-02-24)

- **Protected routes** — `/chat`, `/optimize`, `/league` added to middleware protection. Centralized `PROTECTED_PATH_PREFIXES`.
- **Shared logout** — `src/utils/auth/logout.ts` with `signOutAndRedirect()` for consistent session cleanup.
- **Auth tests** — Playwright API tests (callback redirects, protected route, login page); E2E tests (login, logout, dashboard, guards); auth setup via Dev Login.
- **Auth UX** — Toast notifications for errors; `sanitizeAuthError()`; `Label` component; dev login respects `next` param.

### Fixed — Auth (2026-02-24)

- **Middleware** — Removed redundant `request.cookies.set` in `setAll`; cookie options correctly applied on response.
- **Email auth** — Signup `emailRedirectTo` now encodes `next` path; error handling sanitizes messages.
