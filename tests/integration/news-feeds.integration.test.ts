import { describe, it, expect } from 'vitest';
import Parser from 'rss-parser';

const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const shouldRunLiveFeeds = process.env.RUN_LIVE_FEED_TESTS === 'true';
const describeIfLiveFeeds = shouldRunIntegration && shouldRunLiveFeeds ? describe : describe.skip;

const FEEDS = [
  { source: 'ESPN', url: 'https://www.espn.com/espn/rss/nba/news' },
  { source: 'Rotowire', url: 'https://www.rotowire.com/rss/news.php?sport=NBA' },
  { source: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/nba' },
];

describeIfLiveFeeds('Live news feed integration', () => {
  it('returns at least one item for each configured feed', async () => {
    const parser = new Parser();

    for (const feed of FEEDS) {
      const parsed = await parser.parseURL(feed.url);
      expect(parsed.items.length, `Feed ${feed.source} returned no items`).toBeGreaterThan(0);
    }
  });
});
