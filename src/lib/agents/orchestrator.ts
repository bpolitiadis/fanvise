import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_API_KEY;

// Fail gracefully or log if no key, but ideally this is caught earlier
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Instantiate the Gemini model
// Note: Google AI Studio uses slightly different model names sometimes, but gemini-1.5-flash is standard.
const model = genAI ? genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash-8b',
    generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
        topP: 0.8,
    },
}) : null;

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function fetchWithRetry(fn: () => Promise<any>, maxRetries = 3, initialDelay = 1000) {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            // 429 is Too Many Requests
            if (error?.message?.includes('429') || error?.status === 429) {
                const delay = initialDelay * Math.pow(2, i);
                console.warn(`Gemini API 429 - Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
                await sleep(delay);
                continue;
            }
            throw error; // If it's not a 429, don't retry for now
        }
    }
    throw lastError;
}

const USE_LOCAL_AI = process.env.USE_LOCAL_AI === 'true';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'deepseek-r1:14b';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';

async function generateOllamaResponse(
    history: { role: string; parts: { text: string }[] }[],
    newMessage: string,
    systemInstruction?: string
) {
    // Map Gemini history to Ollama format
    const messages = history.map(h => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts[0].text
    }));

    let finalMessage = newMessage;
    if (systemInstruction) {
        // Many local models (like DeepSeek) handle system context better if it's prepended to the prompt 
        // or as a clearly marked block in the first user message.
        finalMessage = `CONTEXT & INSTRUCTIONS:\n${systemInstruction}\n\nUSER QUERY: ${newMessage}`;
    }

    messages.push({ role: 'user', content: finalMessage });

    const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages,
            stream: true
        })
    });

    if (!response.ok) {
        throw new Error(`Ollama API Error: ${response.status} ${response.statusText}`);
    }

    return response.body;
}

export async function generateResponse(
    history: { role: string; parts: { text: string }[] }[],
    newMessage: string,
    systemInstruction?: string
) {
    if (USE_LOCAL_AI) {
        console.log(`Using Local AI (Ollama: ${OLLAMA_MODEL})`);
        return await generateOllamaResponse(history, newMessage, systemInstruction);
    }

    if (!model) {
        throw new Error("GOOGLE_API_KEY is missing. Please set it in .env.local");
    }

    try {
        const modelWithSystem = systemInstruction
            ? genAI!.getGenerativeModel({
                model: process.env.GEMINI_MODEL || 'gemini-1.5-flash-8b',
                systemInstruction: systemInstruction
            })
            : model;

        const chat = modelWithSystem.startChat({
            history: history as any,
        });

        // Use retry wrapper for the initial call
        const result = await fetchWithRetry(() => chat.sendMessageStream(newMessage));
        return result.stream;
    } catch (error) {
        console.error("Gemini API generation error:", error);
        throw error;
    }
}
