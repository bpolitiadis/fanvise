# User Settings & Configuration

## Overview

The Settings subsystem lets each authenticated user store their own Gemini API key and ESPN Fantasy League connection directly in the database. This enables true per-user BYOK (Bring Your Own Key) while keeping local development frictionless.

---

## Database Schema

The `user_settings` table lives in the `public` schema and is linked 1-to-1 with `auth.users`:

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` (PK) | FK → `auth.users.id`, cascade delete |
| `gemini_api_key_encrypted` | `text \| null` | Stored as plain text today; swap for Supabase Vault / pgcrypto as needed |
| `espn_league_id` | `text \| null` | Numeric string from ESPN league URL. **Required** for Chat/Agent to show your team correctly. |
| `espn_team_id` | `text \| null` | Team number within the league. **Required** for Chat/Agent to show your team correctly. |
| `created_at` | `timestamptz` | Auto-set on insert |
| `updated_at` | `timestamptz` | Auto-updated via trigger |

A `handle_new_user()` trigger automatically inserts a blank row for every new user, so a row always exists.

### RLS Policies

Three policies are enforced — users can only touch **their own** row:

- `SELECT` → `auth.uid() = user_id`
- `INSERT` → `auth.uid() = user_id`
- `UPDATE` → `auth.uid() = user_id`

---

## Dual-Environment Fallback (`src/lib/settings.ts`)

```
DB row value  →  environment variable  →  null
```

`getUserConfig()` resolves config with this priority chain:

1. **Database** – the authenticated user's `user_settings` row.
2. **Environment variables** – `GEMINI_API_KEY` and `NEXT_PUBLIC_TEST_ESPN_LEAGUE_ID`.
3. **`null`** – caller must handle this gracefully.

This means:

- **Production**: each user's saved values are used automatically.
- **Local dev / CI**: set the env vars in `.env.local` and the test user row is irrelevant.

```ts
// Example usage in a Server Component or Server Action
import { getUserConfig } from "@/lib/settings";

const config = await getUserConfig();
// config.geminiApiKey, config.espnLeagueId, config.espnTeamId
```

---

## Server Action

`updateUserSettings(data)` in `src/actions/settings.ts`:

- Validates input with Zod (API key length, ESPN IDs must be numeric).
- Calls `supabase.from("user_settings").upsert(...)` scoped to the authenticated user — RLS enforces this at the DB level too.
- Calls `revalidatePath("/settings")` so the page reflects the updated state immediately.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Dev fallback | Platform-level Gemini key, used when no per-user key is set |
| `NEXT_PUBLIC_TEST_ESPN_LEAGUE_ID` | Dev fallback | Test league ID for local development |

Add both to `.env.local` (already in `.gitignore`). **Never commit real API keys.**

---

## Applying the Migration

```bash
# Against the remote Supabase project
supabase db push

# Or run the migration file directly via the Supabase Dashboard SQL editor:
# supabase/migrations/20260223100000_add_espn_fields_to_user_settings.sql
```
