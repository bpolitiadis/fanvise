/**
 * FanVise AI Service
 * 
 * Centralized service for AI model interactions and abstracting provider complexity.
 * 
 * ARCHITECTURE NOTE:
 * Uses a "Dual-Provider Strategy":
 * 1. **Google Gemini (Cloud)**: Primary engine for high-reasoning tasks (Strategic Advice).
 * 2. **Ollama (Local)**: Optional fallback or privacy-focused alternative for users 
 *    running distinct local models (e.g., DeepSeek R1 for logic without data leakage).
 * 
 * This abstraction ensures the rest of the app doesn't care which brain is thinking.
 * 
 * @module services/ai
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { AIStructuredResponseSchema, type AIStructuredResponse } from '@/prompts/types';
import { withRetry, sleep } from '@/utils/retry';

// ============================================================================
// Configuration
// ============================================================================

/** Gemini API key from environment */
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

/** Gemini model to use */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

/** Whether to use local AI (Ollama) instead of Gemini */
const USE_LOCAL_AI = process.env.USE_LOCAL_AI;

/** Ollama model name */
const OLLAMA_MODEL = process.env.OLLAMA_MODEL;

/** Ollama API endpoint */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';

// Initialize Gemini client
const genAI = GOOGLE_API_KEY ? new GoogleGenerativeAI(GOOGLE_API_KEY) : null;

/** Embedding Provider Type */
export type EmbeddingProviderType = 'gemini' | 'ollama' | 'openai';

/** Intelligence Provider Type */
export type IntelligenceProviderType = 'gemini' | 'ollama';

/**
 * Interface for Embedding Providers
 */
export interface EmbeddingProvider {
    embedContent(text: string): Promise<number[]>;
}

/**
 * Interface for Intelligence Providers
 */
export interface IntelligenceProvider {
    extractIntelligence(prompt: string): Promise<any>;
}

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
export type StreamResult = AsyncIterable<string>;

// ============================================================================
// Utility Functions
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

    console.log(`[AI Service] Initializing Gemini with model: ${GEMINI_MODEL}`);
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
 * @returns Async iterable of response chunks
 */
async function generateOllamaStream(
    history: ChatMessage[],
    message: string,
    options: GenerateOptions = {}
): Promise<AsyncIterable<string>> {
    // Build Ollama message array with proper role separation.
    // CRITICAL FIX: Use Ollama's native `system` role for the intelligence context
    // (league rosters, matchup scores, scoring settings, free agents, news).
    // Previously, this was prepended as plain text into the user message, causing
    // the model to lose the boundary between "what I should know" and "what I'm asked",
    // resulting in the "I don't have access to your roster" fallback response.
    const messages: Array<{ role: string; content: string }> = [];

    if (options.systemInstruction) {
        messages.push({ role: 'system', content: options.systemInstruction });
    }

    // Append conversation history
    history.forEach(msg => messages.push({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.content,
    }));

    // Append current user query as a separate message
    messages.push({ role: 'user', content: message });

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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return {
        async *[Symbol.asyncIterator]() {
            try {
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
                                yield json.message.content;
                            }
                        } catch {
                            // Fragmented JSON, skip
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        }
    };
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
        let result = '';

        for await (const chunk of stream) {
            result += chunk;
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

// ============================================================================
// Intelligence Provider Implementations
// ============================================================================

/**
 * Gemini Intelligence Provider
 */
class GeminiIntelligenceProvider implements IntelligenceProvider {
    async extractIntelligence(prompt: string): Promise<any> {
        if (!genAI) throw new Error('Gemini API key not configured');

        const generationModelCandidates = [
            "gemini-2.0-flash",
            "gemini-flash-latest",
            "gemini-1.5-flash",
        ];

        let lastError: any;
        for (const modelName of generationModelCandidates) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await withRetry(async () => {
                    const response = await model.generateContent({
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        generationConfig: { responseMimeType: "application/json" }
                    });
                    const text = response.response.text();
                    return JSON.parse(text);
                });
                return result;
            } catch (error) {
                lastError = error;
                console.warn(`[AI Service] Gemini model ${modelName} failed or not available. Trying next...`);
            }
        }
        throw lastError;
    }
}

/**
 * Ollama Intelligence Provider (Local)
 */
class OllamaIntelligenceProvider implements IntelligenceProvider {
    private model: string;

    constructor(model: string = OLLAMA_MODEL || 'deepseek-r1:14b') {
        this.model = model;
    }

    async extractIntelligence(prompt: string): Promise<any> {
        console.log(`[AI Service] Using local Ollama model: ${this.model}`);

        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                prompt: prompt,
                stream: false,
                format: 'json',
                options: {
                    temperature: 0.1, // Low temperature for extraction reliability
                }
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama Intelligence Error: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        try {
            // Ollama responses sometimes contain think tags if using DeepSeek R1
            let content = json.response;
            if (content.includes('</think>')) {
                content = content.split('</think>').pop()?.trim() || content;
            }
            return JSON.parse(content);
        } catch (error) {
            console.error('[AI Service] Failed to parse JSON from Ollama:', json.response);
            throw new Error('Invalid JSON response from local AI');
        }
    }
}

/**
 * Gets the configured intelligence provider based on environment variables.
 */
export function getIntelligenceProvider(): IntelligenceProvider {
    if (USE_LOCAL_AI === 'true') {
        return new OllamaIntelligenceProvider();
    }
    return new GeminiIntelligenceProvider();
}

/**
 * High-level function to extract structured intelligence using the configured provider.
 */
export async function extractIntelligence(prompt: string): Promise<any> {
    const provider = getIntelligenceProvider();
    return provider.extractIntelligence(prompt);
}

// ============================================================================
// Embedding Provider Implementations
// ============================================================================

/**
 * Gemini Embedding Provider
 */
class GeminiEmbeddingProvider implements EmbeddingProvider {
    async embedContent(text: string): Promise<number[]> {
        if (!genAI) throw new Error('Gemini API key not configured');
        const modelName = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
        const model = genAI.getGenerativeModel({ model: modelName });

        return withRetry(async () => {
            const result = await model.embedContent(text);
            if (!result.embedding?.values) {
                throw new Error(`Empty embedding result from Gemini (${modelName})`);
            }
            return result.embedding.values;
        });
    }
}

/**
 * Ollama Embedding Provider (Local)
 */
class OllamaEmbeddingProvider implements EmbeddingProvider {
    private model: string;

    constructor(model: string = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text') {
        this.model = model;
    }

    async embedContent(text: string): Promise<number[]> {
        const response = await fetch('http://localhost:11434/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                prompt: text,
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama Embedding Error: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        if (!json.embedding) {
            throw new Error(`Empty embedding result from Ollama (${this.model})`);
        }

        return json.embedding;
    }
}

/**
 * Gets the configured embedding provider based on environment variables.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
    const providerType = (process.env.EMBEDDING_PROVIDER || 'gemini').toLowerCase();

    switch (providerType) {
        case 'ollama':
            console.log(`[AI Service] Using Ollama Embedding Provider (${process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'})`);
            return new OllamaEmbeddingProvider();
        case 'openai':
            throw new Error('OpenAI Embedding Provider not yet implemented');
        case 'gemini':
        default:
            console.log(`[AI Service] Using Gemini Embedding Provider (${process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004'})`);
            return new GeminiEmbeddingProvider();
    }
}

/**
 * High-level function to generate embeddings using the configured provider.
 * 
 * @param text - The content to embed
 * @returns Vector embedding (array of numbers)
 */
export async function getEmbedding(text: string): Promise<number[]> {
    const provider = getEmbeddingProvider();
    return provider.embedContent(text);
}

/**
 * Checks if the AI service is properly configured and available.
 * 
 * @returns Object indicating availability status
 */
export function getServiceStatus(): {
    provider: 'gemini' | 'ollama';
    model: string;
    embeddingProvider: string;
    configured: boolean;
} {
    const embeddingProvider = process.env.EMBEDDING_PROVIDER || 'gemini';

    if (USE_LOCAL_AI === 'true') {
        return {
            provider: 'ollama',
            model: OLLAMA_MODEL || 'unknown',
            embeddingProvider,
            configured: true,
        };
    }

    return {
        provider: 'gemini',
        model: GEMINI_MODEL,
        embeddingProvider,
        configured: !!GOOGLE_API_KEY,
    };
}
