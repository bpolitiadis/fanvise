/**
 * Utility for sleeping/delaying execution.
 * @param ms - Milliseconds to sleep
 */
export const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executes a function with exponential backoff retry.
 * Defaults to retrying on 429 (Rate Limit) errors.
 * 
 * @param fn - The async function to execute
 * @param maxRetries - Maximum number of retry attempts
 * @param initialDelay - Initial delay in milliseconds
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 4, // Increased from 3
    initialDelay: number = 2000 // Increased from 1000
): Promise<T> {
    let lastError: unknown;

    const getStatus = (error: unknown): number => {
        if (typeof error !== 'object' || error === null) return 0;
        const maybe = error as { status?: unknown; statusCode?: unknown };
        if (typeof maybe.status === 'number') return maybe.status;
        if (typeof maybe.statusCode === 'number') return maybe.statusCode;
        return 0;
    };

    const getMessage = (error: unknown): string => {
        if (error instanceof Error) return error.message;
        if (typeof error === 'string') return error;
        return '';
    };

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            lastError = error;
            const status = getStatus(error);
            const message = getMessage(error);
            const isRateLimited = status === 429 || message.includes('429');

            if (isRateLimited) {
                // If the error message contains a specific retry delay (e.g. "Please retry in 22.8s")
                // we try to extract and honor it, otherwise use exponential backoff
                let delay = initialDelay * Math.pow(2, attempt);
                const maxDelayMs = Number(process.env.RETRY_MAX_DELAY_MS ?? (process.env.VERCEL ? 4000 : 60000));

                const match = message.match(/retry in ([\d.]+)s/i);
                if (match) {
                    const seconds = parseFloat(match[1]);
                    delay = Math.max(delay, (seconds + 1) * 1000); // Add a buffer
                }

                // Production-safe cap: avoid very long backoff windows that exceed
                // serverless execution budgets and appear as "hanging" requests.
                delay = Math.min(delay, maxDelayMs);

                console.warn(
                    `API rate limited (429) - Retrying in ${Math.round(delay / 1000)}s (Attempt ${attempt + 1}/${maxRetries})`
                );
                await sleep(delay);
                continue;
            }

            // Non-recoverable error, throw immediately
            throw error;
        }
    }

    throw lastError;
}
