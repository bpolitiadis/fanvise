# Authentication System

## Overview
FanVise uses Supabase Auth for user authentication. We support the following methods:
1.  **Google OAuth**: Primary method for production.
2.  **Email & Password**: Secondary method, useful for users who prefer standard credentials.
3.  **Developer Login**: A shortcut for local development environments (`NODE_ENV=development`).

## Setup
Ensure your Supabase project has the following providers enabled:
-   **Google**: With Client ID and Secret configured.
-   **Email**: Ensure "Enable Email/Password" is checked.

## Local Development
To improve developer experience, we've added a **Quick Login** button that is ONLY visible when `NODE_ENV` is `development`.

### How to use Dev Login
1.  Ensure you have a user in your local Supabase instance/project with:
    -   **Email**: `test@example.com`
    -   **Password**: `password123`
2.  Navigate to `/login`.
3.  Click the **"Quick Login (test@example.com)"** button.
4.  You will be instantly logged in and redirected to the dashboard.

> [!NOTE]
> If the button does not appear, check that your `.env.local` or environment has `NODE_ENV=development`.

## Architecture
-   **Client Wrapper**: `src/utils/supabase/client.ts` uses `@supabase/ssr` for browser-side operations.
-   **Middleware**: `src/middleware.ts` handles session logical and route protection.
-   **Components**: located in `src/components/auth/`.
    -   `email-auth-form.tsx`: Handles Sign In/Up UI and logic.
    -   `dev-login-button.tsx`: The dev-only shortcut.
