import { test, expect } from '@playwright/test';

test('dashboard renders correctly', async ({ page }) => {
    await page.goto('/');

    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/FanVise/i);

    // Check if the Intelligence Dashboard header is present
    await expect(page.getByText('Intelligence Dashboard')).toBeVisible();

    // Check if the sidebar is present (e.g., searching for "Dashboard" link)
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
});
