# Getting Started with FanVise

Welcome to FanVise! This guide will help you set up your development environment and get the application running locally.

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

1.  **Node.js & pnpm**
    *   **Node.js**: Version 20 or higher is required.
    *   **pnpm**: We use pnpm for package management.
    *   *Installation:* `corepack enable && corepack prepare pnpm@latest --activate`.

2.  **Docker**
    *   Required to run the local Supabase instance.
    *   *Installation:* [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [OrbStack](https://orbstack.dev/) (recommended for Mac).

3.  **Supabase CLI**
    *   Required for local database management and migrations.
    *   *Installation:* `brew install supabase/tap/supabase` (Mac) or see [Supabase CLI docs](https://supabase.com/docs/guides/cli).

4.  **Ollama (Optional but Recommended)**
    *   Required if you want to run the "Local AI" mode.
    *   *Installation:* [Download Ollama](https://ollama.com/).

## Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/fanvise.git
    cd fanvise
    ```

2.  **Install dependencies**:
    ```bash
    pnpm install
    ```

## Configuration

1.  **Environment Variables**:
    Copy the example environment file (if available) or create a `.env.local` file in the root directory:

    ```bash
    cp .env.example .env.local
    ```

    Update `.env.local` with your detailed configuration:

    ```env
    # --- Supabase Configuration ---
    # Retrieve these after starting Supabase locally (see below)
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key
    SUPABASE_SERVICE_ROLE_KEY=your_local_service_role_key

    # --- ESPN Authentication ---
    # Required for private league data
    ESPN_S2=your_espn_s2_cookie
    SWID={your_swid_cookie}

    # --- AI Configuration (Cloud - Gemini) ---
    GOOGLE_API_KEY=your_gemini_api_key
    GEMINI_MODEL=gemini-2.0-flash
    GEMINI_EMBEDDING_MODEL=gemini-embedding-001

    # --- AI Configuration (Local - Ollama) ---
    # Set to 'true' to use local Ollama models instead of Gemini
    USE_LOCAL_AI=false
    OLLAMA_URL=http://localhost:11434/api/chat
    OLLAMA_MODEL=llama3.1
    OLLAMA_EMBEDDING_MODEL=nomic-embed-text
    
    # --- Logging ---
    LOG_LEVEL=info
    ```

## Running Locally

### 1. Start Supabase
Start the local database and services. This requires Docker to be running.

```bash
supabase start
```

*   This will output your local `API URL`, `anon key`, and `service_role key`.
*   **Update your `.env.local` file with these values.**

### 2. Database Migrations
Apply the database schema to your local instance:

```bash
supabase migration up
```

*(Optional) Seed data:* If `seed.sql` exists, it will be applied automatically on start, or you can run:

```bash
supabase db reset
```

### 3. Start Application
Run the Next.js development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. (Optional) Start Local AI
If you enabled `USE_LOCAL_AI=true`, ensure Ollama is running and has the required models pulled:

```bash
# Pull the chat model (must support tool-calling for agent mode)
ollama pull llama3.1

# Pull the embedding model
ollama pull nomic-embed-text

# Start the server (if not already running app)
ollama serve
```

## Troubleshooting

*   **Supabase Connection Issues**: Ensure Docker is running. Try `supabase stop` followed by `supabase start` if issues persist.
*   **ESPN Login Failed**: Your `ESPN_S2` and `SWID` cookies expire periodically (approx. every 14 days or on logout). You may need to refresh them from your browser cookies on espn.com.
*   **Ollama Not Responding**: Ensure `OLLAMA_URL` is reachable and CORS is configured if running across different networks (default localhost is usually fine).
*   **"does not support tools" error**: The agent chat requires a model that supports tool-calling (e.g. `llama3.1`, `mistral`, `qwen2.5`). Set `OLLAMA_MODEL=llama3.1` in `.env.local` and run `ollama pull llama3.1`.
