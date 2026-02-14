import { loadEnv } from './load-env';

const run = async (): Promise<void> => {
  loadEnv();
  console.log('[Ops] Starting news ingestion...');

  try {
    const { fetchAndIngestNews } = await import('@/services/news.service');
    const count = await fetchAndIngestNews();
    console.log(`[Ops] News ingestion complete. Imported: ${count}`);
  } catch (error) {
    console.error('[Ops] News ingestion failed:', error);
    process.exit(1);
  }
};

void run();
