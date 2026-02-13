import { test, expect } from '@playwright/test';

test.describe('API Sanity Checks', () => {
    test('Health Check - Root URL should be accessible', async ({ request }) => {
        const response = await request.get('/');
        expect(response.status()).toBe(200);
    });

    test('API Health - Should handle basic API request', async ({ request }) => {
        // Checking if the API route base is responsive. 
        // Note: API routes might return 404 if no specific route handler exists at root /api/
        // Checking a known safe route or just verifying we get a response (even 404/405 is checking connectivity vs connection refused)
        const response = await request.get('/api/health-check-non-existent');
        // We expect a 404, which confirms the server is reachable but the route doesn't exist.
        // If the server was down, it would throw a connection error.
        expect(response.status()).toBe(404);
    });
});
