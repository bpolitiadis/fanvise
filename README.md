# FanVise

**The Intelligent Edge for Fantasy Basketball.**

FanVise is a serverless, AI-negative intelligence platform for ESPN Fantasy Basketball (H2H Points). It uses a RAG architecture to combine private league data with public real-time intelligence.

## Tech Stack

*   **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
*   **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
*   **Database**: Supabase (PostgreSQL)
*   **Backend Logic**: Google Cloud Functions (Python - *Decoupled*)
*   **State/Animations**: Framer Motion

## Getting Started

1.  **Install Dependencies**:
    ```bash
    pnpm install
    ```

2.  **Run Development Server**:
    ```bash
    pnpm dev
    ```

3.  **Build for Production**:
    ```bash
    pnpm build
    ```

## Environment Variables

Ensure you have a `.env.local` file with the following:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
LOG_LEVEL=info
```

## Directory Structure

*   `src/app`: Next.js App Router pages.
*   `src/components`: UI components (shadcn & custom).
*   `src/lib`: Utilities (Supabase client, logger, cn).
*   `src/services`: Decoupled business logic and API services.
*   `supabase`: Database migrations and schema definitions.
