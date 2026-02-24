import { test, expect } from '@playwright/test';

test.describe('Auth flows', () => {
  test.describe('unauthenticated', () => {
    test('protected route redirects to login', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole('heading', { name: /Welcome to FanVise/i })).toBeVisible();
    });

    test('login page renders with Google and email options', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();
      await expect(page.getByText(/Or continue with/i)).toBeVisible();
    });

    test('login page preserves next param when redirecting', async ({ page }) => {
      await page.goto('/dashboard');
      expect(page.url()).toContain('/login');
      expect(page.url()).toContain('next=');
    });
  });
});

test.describe('authenticated', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('dashboard loads when authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Intelligence Dashboard')).toBeVisible({ timeout: 5000 });
  });

  test('dashboard renders correctly', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/FanVise/i);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Intelligence Dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Intelligence Dashboard')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Logout/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});
