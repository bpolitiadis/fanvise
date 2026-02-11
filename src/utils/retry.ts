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
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            const status = error.status || error.statusCode || 0;
            const message = error.message || '';
            const isRateLimited = status === 429 || message.includes('429');

            if (isRateLimited) {
                // If the error message contains a specific retry delay (e.g. "Please retry in 22.8s")
                // we try to extract and honor it, otherwise use exponential backoff
                let delay = initialDelay * Math.pow(2, attempt);

                const match = message.match(/retry in ([\d.]+)s/i);
                if (match) {
                    const seconds = parseFloat(match[1]);
                    delay = Math.max(delay, (seconds + 1) * 1000); // Add a buffer
                }

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
