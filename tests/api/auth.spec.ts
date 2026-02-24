import { test, expect } from '@playwright/test';

test.describe('Auth API', () => {
  test('auth callback without code redirects to login with error', async ({ request }) => {
    const response = await request.get('/auth/callback', { maxRedirects: 0 });
    expect(response.status()).toBeGreaterThanOrEqual(302);
    expect(response.status()).toBeLessThan(400);
    const location = response.headers()['location'] ?? '';
    expect(location).toContain('/login');
    expect(location).toContain('error=auth_callback_failed');
  });

  test('auth callback with invalid code redirects to login with error', async ({ request }) => {
    const response = await request.get('/auth/callback?code=invalid_code_12345', { maxRedirects: 0 });
    expect(response.status()).toBeGreaterThanOrEqual(302);
    expect(response.status()).toBeLessThan(400);
    const location = response.headers()['location'] ?? '';
    expect(location).toContain('/login');
  });

  test('protected route redirects unauthenticated requests to login', async ({ request }) => {
    const response = await request.get('/', { maxRedirects: 0 });
    expect([302, 307, 308]).toContain(response.status());
    const location = response.headers()['location'] ?? '';
    expect(location).toContain('/login');
    expect(location).toContain('next=');
  });

  test('login page is accessible', async ({ request }) => {
    const response = await request.get('/login');
    expect(response.status()).toBe(200);
  });
});
