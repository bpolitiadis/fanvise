import { backfillNews } from '@/services/news.service';
import { loadEnv } from './load-env';

const run = async (): Promise<void> => {
  loadEnv();
  console.log('[Ops] Starting historical news backfill...');

  try {
    const pages = Number(process.env.NEWS_BACKFILL_PAGES || '3');
    const count = await backfillNews([], pages);
    console.log(`[Ops] Historical backfill complete. Imported: ${count}`);
  } catch (error) {
    console.error('[Ops] Historical backfill failed:', error);
    process.exit(1);
  }
};

void run();
