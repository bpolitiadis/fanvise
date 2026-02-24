import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(process.cwd(), 'playwright', '.auth', 'user.json');

/**
 * Authenticates via Dev Login (test@example.com) and saves storage state.
 * Requires NODE_ENV=development and a test user in Supabase.
 * See docs/Authentication.md for setup.
 */
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /Welcome to FanVise/i })).toBeVisible();

  // Dev Login button is only shown in development
  const devButton = page.getByRole('button', { name: /Quick Login/i });
  const isVisible = await devButton.isVisible();

  if (!isVisible) {
    throw new Error(
      'Dev Login button not visible. Ensure NODE_ENV=development and the test user exists in Supabase (test@example.com / password123).'
    );
  }

  await devButton.click();
  await page.waitForURL(url => !url.pathname.includes('login'), { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 25000 });

  await page.context().storageState({ path: authFile });
});
