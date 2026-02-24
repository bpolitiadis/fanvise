# Authentication System

## Overview

FanVise uses Supabase Auth with SSR cookie sessions. We support:

1. **Google OAuth** — Primary method for production
2. **Email & Password** — Sign in / sign up with credentials
3. **Developer Login** — Shortcut for local development (`NODE_ENV=development`)

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Browser   │────▶│   Middleware      │────▶│  Server / Routes    │
│   (Client)  │     │   updateSession   │     │  (Server Components │
│             │◀────│   - get all req   │     │   Server Actions)   │
│ createClient│     │   cookies         │     │                     │
│ (browser)   │     │   - refresh token │     │ createClient        │
│             │     │   - route guard   │     │ (server)            │
└─────────────┘     └──────────────────┘     └─────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/middleware.ts` | Entry point; delegates to `updateSession` |
| `src/utils/supabase/middleware.ts` | Session refresh (`getUser`), route protection |
| `src/utils/supabase/client.ts` | Browser Supabase client (`createBrowserClient`) |
| `src/utils/supabase/server.ts` | Server Supabase client (cookies from `next/headers`) |
| `src/utils/auth/logout.ts` | Shared `signOutAndRedirect` utility |
| `src/app/login/page.tsx` | Login UI (Google, Email, Dev) |
| `src/app/auth/callback/route.ts` | OAuth PKCE code exchange |

### Cookie Handling

- Supabase stores session in **HTTP-only cookies** (set by `@supabase/ssr`).
- Middleware uses `getAll` / `setAll` only (no deprecated `get`/`set`/`remove`).
- Session refresh happens when `getUser()` is called in middleware.

## Login Flow

1. User visits `/login`
2. **Google**: Clicks "Sign in with Google" → redirects to Supabase → callback to `/auth/callback?code=...`
3. **Email**: Submits form → `signInWithPassword` or `signUp` → on success, redirect or toast
4. **Dev**: Clicks "Quick Login" → `signInWithPassword` with test credentials → redirect to dashboard
5. Callback route exchanges `code` for session, sets cookies, redirects to `next` or `/dashboard`

## Logout Flow

1. User triggers logout (sidebar button)
2. `signOutAndRedirect` calls `supabase.auth.signOut()` and navigates to `/login` via `window.location.href`
3. Full page load ensures cookies are cleared and middleware sees updated state

## Protected Routes

All paths in `PROTECTED_PATH_PREFIXES` require an authenticated user:

- `/` (home)
- `/dashboard`
- `/settings`
- `/chat`
- `/optimize`
- `/league`

Unauthenticated requests redirect to `/login?next=<original-path>`.

Authenticated users visiting `/login` are redirected to `/`.

## Security

- **Server Actions** re-validate via `supabase.auth.getUser()` before acting.
- **Error sanitization**: Auth errors are sanitized before display (no stack traces or internal details).
- **Dev credentials**: Hardcoded `test@example.com` / `password123` only when `NODE_ENV=development`.

## Setup

1. Enable **Google** and **Email** providers in Supabase Dashboard.
2. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. Configure redirect URLs in Supabase: `http://localhost:3000/auth/callback` (and production origin).

## Local Development

### Dev Login

1. Create a user in local Supabase: `test@example.com` / `password123`
2. Ensure `NODE_ENV=development`
3. Go to `/login` and click "Quick Login (test@example.com)"

### E2E Tests

Playwright auth tests use Dev Login for setup:

```bash
NODE_ENV=development pnpm exec playwright test tests/auth.setup.ts tests/e2e/auth.test.ts tests/api/auth.spec.ts
```

- `tests/auth.setup.ts` authenticates via Dev Login and saves state to `playwright/.auth/user.json`
- Requires `test@example.com` / `password123` in Supabase and `NODE_ENV=development`
- API tests run without auth; E2E authenticated tests depend on setup
