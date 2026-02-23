/**
 * Diagnostic: news_items counts and date range.
 * Run: npx tsx src/ops/news-stats.ts
 * Use .env.local (local) or point to production DB for prod check.
 */
import { loadEnv } from "./load-env";
import { createClient } from "@supabase/supabase-js";

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const isProd = process.env.VERCEL_ENV === "production" || url?.includes("supabase.co");

  console.log(`\n=== News Items Diagnostics (${isProd ? "PRODUCTION" : "LOCAL"}) ===\n`);

  const { count, error: countError } = await supabase
    .from("news_items")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error("Count error:", countError.message);
    process.exit(1);
  }
  console.log(`Total rows: ${count ?? 0}`);

  const { data: range, error: rangeError } = await supabase
    .from("news_items")
    .select("published_at, created_at")
    .order("published_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: latest, error: latestError } = await supabase
    .from("news_items")
    .select("published_at, created_at, title")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rangeError && range) {
    console.log(`Oldest published_at: ${range.published_at}`);
  }
  if (!latestError && latest) {
    console.log(`Newest published_at: ${latest.published_at}`);
    console.log(`  (${(latest.title as string)?.substring(0, 50)}...)`);
  }

  const { data: sourceRows } = await supabase.from("news_items").select("source");
  const bySource: Record<string, number> = {};
  for (const row of sourceRows || []) {
    const s = (row as { source: string }).source;
    bySource[s] = (bySource[s] ?? 0) + 1;
  }

  if (Object.keys(bySource).length > 0) {
    console.log("\nBy source:");
    for (const [src, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${src}: ${n}`);
    }
  }

  console.log("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
