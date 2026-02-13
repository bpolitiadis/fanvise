import { describe, it, expect } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIfIntegration = shouldRunIntegration ? describe : describe.skip;

describeIfIntegration('Embedding integration', () => {
  it('generates a non-empty embedding vector', async () => {
    const { getEmbedding, getServiceStatus } = await import('@/services/ai.service');
    const status = getServiceStatus();

    // Integration tests require a configured embedding backend.
    expect(status.configured).toBe(true);

    const embedding = await getEmbedding('Los Angeles Lakers face Golden State tonight.');
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
  });
});
