/**
 * Shared AI provider configuration for all FanVise agents.
 *
 * Centralizes the Ollama/Gemini provider selection logic so that every agent
 * (supervisor, player-research, future sub-agents) reads from one source of
 * truth instead of duplicating environment variable checks.
 *
 * Rules:
 * - On Vercel (any VERCEL_ENV): always use Gemini regardless of USE_LOCAL_AI.
 * - Locally with USE_LOCAL_AI=true: use Ollama.
 * - Default: Gemini.
 */

const IS_VERCEL = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);

/** True when local Ollama should be used as the LLM provider. */
export const USE_LOCAL_AI = process.env.USE_LOCAL_AI === "true" && !IS_VERCEL;

/** Resolved Ollama base URL (origin only, no path). */
export const OLLAMA_BASE_URL = (() => {
  const raw = process.env.OLLAMA_URL || "http://localhost:11434/api/chat";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:11434";
  }
})();

/** Active provider name — useful for response headers and logging. */
export const ACTIVE_PROVIDER: "ollama" | "gemini" = USE_LOCAL_AI ? "ollama" : "gemini";

/**
 * Default Ollama model for agents. Must support tool/function calling.
 * deepseek-r1:14b does NOT support tools — use llama3.1, mistral, qwen2.5, etc.
 * @see https://docs.ollama.com/capabilities/tool-calling
 */
const DEFAULT_OLLAMA_AGENT_MODEL = "llama3.1";

/** Active model name — consistent with what's actually instantiated. */
export const ACTIVE_MODEL = USE_LOCAL_AI
  ? (process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_AGENT_MODEL)
  : (process.env.GEMINI_MODEL || "gemini-2.0-flash");
