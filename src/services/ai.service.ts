/**
 * FanVise AI Service
 * 
 * Centralized service for AI model interactions.
 * Supports both Google Gemini (cloud) and Ollama (local) backends.
 * 
 * @module services/ai
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { z } from 'zod';
import { AIStructuredResponseSchema, type AIStructuredResponse } from '@/prompts/types';

// ============================================================================
// Configuration
// ============================================================================

/** Gemini API key from environment */
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

/** Gemini model to use */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash-8b';

/** Whether to use local AI (Ollama) instead of Gemini */
const USE_LOCAL_AI = process.env.USE_LOCAL_AI === 'true';

/** Ollama model name */
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'deepseek-r1:14b';

/** Ollama API endpoint */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';

// Initialize Gemini client
const genAI = GOOGLE_API_KEY ? new GoogleGenerativeAI(GOOGLE_API_KEY) : null;

// ============================================================================
// Types
// ============================================================================

/**
 * Chat message format compatible with both Gemini and Ollama.
 */
export interface ChatMessage {
    role: 'user' | 'model' | 'assistant';
    content: string;
}

/**
 * Options for AI response generation.
 */
export interface GenerateOptions {
    /** Maximum tokens in the response */
    maxTokens?: number;
    /** Temperature for response randomness (0-2) */
    temperature?: number;
    /** Top-p sampling */
    topP?: number;
    /** System instruction to prepend */
    systemInstruction?: string;
}

/**
 * Result of a streaming response generation.
 */
export type StreamResult = AsyncIterable<string> | ReadableStream<Uint8Array>;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for a specified duration.
 * @param ms - Milliseconds to sleep
 */
const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executes a function with exponential backoff retry on 429 errors.
 * 
 * @param fn - The async function to execute
 * @param maxRetries - Maximum number of retry attempts
 * @param initialDelay - Initial delay in milliseconds
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            lastError = error as Error;
            const errorMessage = lastError?.message || '';
            const isRateLimited = errorMessage.includes('429') ||
                (error as { status?: number })?.status === 429;

            if (isRateLimited) {
                const delay = initialDelay * Math.pow(2, attempt);
                console.warn(
                    `AI API rate limited - Retrying in ${delay}ms (Attempt ${attempt + 1}/${maxRetries})`
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

// ============================================================================
// Gemini Implementation
// ============================================================================

/**
 * Gets a configured Gemini model instance.
 * 
 * @param options - Generation options
 * @returns Configured GenerativeModel instance
 * @throws Error if GOOGLE_API_KEY is not set
 */
function getGeminiModel(options: GenerateOptions = {}): GenerativeModel {
    if (!genAI) {
        throw new Error('GOOGLE_API_KEY is not configured. Set it in .env.local');
    }

    const modelConfig: Parameters<typeof genAI.getGenerativeModel>[0] = {
        model: GEMINI_MODEL,
        generationConfig: {
            maxOutputTokens: options.maxTokens ?? 2048,
            temperature: options.temperature ?? 0.7,
            topP: options.topP ?? 0.8,
        },
    };

    if (options.systemInstruction) {
        modelConfig.systemInstruction = options.systemInstruction;
    }

    return genAI.getGenerativeModel(modelConfig);
}

/**
 * Generates a streaming response using Gemini.
 * 
 * @param history - Previous conversation messages
 * @param message - The new user message
 * @param options - Generation options
 * @returns Async iterable of response chunks
 */
async function generateGeminiStream(
    history: ChatMessage[],
    message: string,
    options: GenerateOptions = {}
): Promise<AsyncIterable<string>> {
    const model = getGeminiModel(options);

    // Convert history to Gemini format
    const geminiHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({ history: geminiHistory as any });

    const result = await withRetry(() => chat.sendMessageStream(message));

    // Transform Gemini stream to simple text stream
    return {
        async *[Symbol.asyncIterator]() {
            for await (const chunk of result.stream) {
                const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    yield text;
                }
            }
        },
    };
}

// ============================================================================
// Ollama Implementation
// ============================================================================

/**
 * Generates a streaming response using Ollama (local AI).
 * 
 * @param history - Previous conversation messages
 * @param message - The new user message
 * @param options - Generation options
 * @returns ReadableStream of response chunks
 */
async function generateOllamaStream(
    history: ChatMessage[],
    message: string,
    options: GenerateOptions = {}
): Promise<ReadableStream<Uint8Array>> {
    // Convert to Ollama message format
    const messages = history.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.content,
    }));

    // Prepend system instruction if provided
    let finalMessage = message;
    if (options.systemInstruction) {
        finalMessage = `CONTEXT & INSTRUCTIONS:\n${options.systemInstruction}\n\nUSER QUERY: ${message}`;
    }

    messages.push({ role: 'user', content: finalMessage });

    const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages,
            stream: true,
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama API Error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
        throw new Error('Ollama response has no body');
    }

    return response.body;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generates a streaming AI response.
 * 
 * Automatically selects between Gemini (cloud) and Ollama (local) based on
 * the USE_LOCAL_AI environment variable.
 * 
 * @param history - Previous conversation messages
 * @param message - The new user message
 * @param options - Generation options including system instruction
 * @returns StreamResult that can be iterated for response chunks
 * 
 * @example
 * ```typescript
 * import { generateStreamingResponse } from '@/services/ai.service';
 * import { getSystemPrompt } from '@/prompts';
 * 
 * const systemPrompt = getSystemPrompt('consigliere', context);
 * 
 * const stream = await generateStreamingResponse(
 *   chatHistory,
 *   userMessage,
 *   { systemInstruction: systemPrompt }
 * );
 * 
 * for await (const chunk of stream) {
 *   console.log(chunk);
 * }
 * ```
 */
export async function generateStreamingResponse(
    history: ChatMessage[],
    message: string,
    options: GenerateOptions = {}
): Promise<StreamResult> {
    if (USE_LOCAL_AI) {
        console.log(`[AI Service] Using Ollama (${OLLAMA_MODEL})`);
        return generateOllamaStream(history, message, options);
    }

    console.log(`[AI Service] Using Gemini (${GEMINI_MODEL})`);
    return generateGeminiStream(history, message, options);
}

/**
 * Generates a non-streaming AI response.
 * 
 * Useful for single-shot queries where streaming is not needed.
 * 
 * @param message - The user message
 * @param options - Generation options
 * @returns The complete response text
 */
export async function generateResponse(
    message: string,
    options: GenerateOptions = {}
): Promise<string> {
    if (USE_LOCAL_AI) {
        // For Ollama, collect the stream
        const stream = await generateOllamaStream([], message, options);
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let result = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const json = JSON.parse(line);
                    if (json.message?.content) {
                        result += json.message.content;
                    }
                } catch {
                    // Skip malformed JSON
                }
            }
        }

        return result;
    }

    // Gemini non-streaming
    const model = getGeminiModel(options);
    const result = await withRetry(() => model.generateContent(message));
    return result.response.text();
}

/**
 * Generates and validates a structured JSON response from the AI.
 * 
 * @param message - The user message
 * @param options - Generation options
 * @returns Validated structured response
 * @throws Error if response fails validation
 */
export async function generateStructuredResponse(
    message: string,
    options: GenerateOptions = {}
): Promise<AIStructuredResponse> {
    const rawResponse = await generateResponse(message, options);

    // Try to extract JSON from the response
    const jsonMatch = rawResponse.match(/```json\n?([\s\S]*?)\n?```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : rawResponse;

    try {
        const parsed = JSON.parse(jsonStr);
        return AIStructuredResponseSchema.parse(parsed);
    } catch (error) {
        console.error('Failed to parse structured response:', error);
        throw new Error('AI response is not valid structured JSON');
    }
}

/**
 * Checks if the AI service is properly configured and available.
 * 
 * @returns Object indicating availability status
 */
export function getServiceStatus(): {
    provider: 'gemini' | 'ollama';
    model: string;
    configured: boolean;
} {
    if (USE_LOCAL_AI) {
        return {
            provider: 'ollama',
            model: OLLAMA_MODEL,
            configured: true, // Ollama availability is runtime-dependent
        };
    }

    return {
        provider: 'gemini',
        model: GEMINI_MODEL,
        configured: !!GOOGLE_API_KEY,
    };
}
