/**
 * Output Compliance Utilities
 *
 * Belt-and-suspenders safety enforcement applied after LLM generation.
 * These rules catch cases where the model omits required safety phrases:
 *  - "do not drop" for unverified star-injury rumors
 *  - Uncertainty calibration boilerplate for future-event claims
 *  - Greek language lock when `language === "el"`
 *
 * Apply by wrapping any streaming output that may involve injury decisions
 * or uncertainty-sensitive queries. Not needed for pure tool-output paths
 * (optimizer, game-log) where the answer is deterministic.
 */

import type { SupportedLanguage } from "@/types/ai";

const GREEK_CHAR_REGEX = /[\u0370-\u03ff\u1f00-\u1fff]/;
const DO_NOT_DROP_TRIGGER_TERMS = ["drop", "waive", "cut", "release"];
const RUMOR_TRIGGER_TERMS = ["rumor", "rumour", "unverified", "acl", "injury", "tore", "rupture"];
const UNCERTAINTY_TRIGGER_TERMS = [
  "100% certainty",
  "exact minute",
  "exact second",
  "guaranteed",
  "without doubt",
  "predict with",
];
const INJURY_QUERY_TERMS = [
  "injury", "injuries", "gtd", "dtd", "questionable", "out", "doubtful",
  "ofs", "availability", "day-to-day", "sspd", "suspended",
];

const containsGreek = (text: string): boolean => GREEK_CHAR_REGEX.test(text);

const needsDoNotDropEnforcement = (message: string): boolean => {
  const normalized = message.toLowerCase();
  const hasDropIntent = DO_NOT_DROP_TRIGGER_TERMS.some((t) => normalized.includes(t));
  const hasRumorIntent = RUMOR_TRIGGER_TERMS.some((t) => normalized.includes(t));
  return hasDropIntent && hasRumorIntent;
};

const needsUncertaintyCalibration = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    UNCERTAINTY_TRIGGER_TERMS.some((t) => normalized.includes(t)) ||
    INJURY_QUERY_TERMS.some((t) => normalized.includes(t))
  );
};

const UNCERTAINTY_BOILERPLATE: Record<SupportedLanguage, string> = {
  en: "Uncertainty calibration: I cannot verify future events or exact timestamps from current evidence. Treat this as probabilistic guidance and monitor official updates.",
  el: "Βαθμονόμηση αβεβαιότητας: Δεν μπορώ να επιβεβαιώσω με βεβαιότητα μελλοντικά γεγονότα ή ακριβή χρονικά σημεία από τα διαθέσιμα στοιχεία. Χρησιμοποίησε αυτό ως πιθανολογική εκτίμηση και έλεγξε επίσημες ενημερώσεις.",
};

/**
 * Appended to the system prompt as a hard compliance section.
 * Use when building prompts for injury/rumor-adjacent queries.
 */
export const complianceContract = (language: SupportedLanguage): string => {
  const doNotDropRule =
    language === "el"
      ? 'Σε μη επιβεβαιωμένες φήμες για τραυματισμό αστέρα, πρέπει να δηλώσεις ρητά: "do not drop".'
      : 'For unverified star injury rumors, you must explicitly include the exact phrase: "do not drop".';
  const greekLockRule =
    language === "el"
      ? "Απάντησε αποκλειστικά στα Ελληνικά."
      : "Respond in English.";

  return `\n\nHARD COMPLIANCE CONTRACT:\n- ${doNotDropRule}\n- ${greekLockRule}\n- If evidence is incomplete, append this sentence verbatim:\n"${UNCERTAINTY_BOILERPLATE[language]}"`;
};

/**
 * Post-processes a completed LLM response to enforce safety phrases
 * the model may have omitted. Idempotent — will not double-append.
 *
 * @param rawOutput - The full LLM output string (not streaming chunks)
 * @param triggerMessage - The original user message (used to detect trigger terms)
 * @param language - Active response language
 */
export const applyCompliancePostProcessing = (
  rawOutput: string,
  triggerMessage: string,
  language: SupportedLanguage
): string => {
  let output = rawOutput.trim();
  const mustDoNotDrop = needsDoNotDropEnforcement(triggerMessage);
  const mustCalibrate = needsUncertaintyCalibration(triggerMessage) || mustDoNotDrop;

  if (mustDoNotDrop && !/do not drop|don't drop/i.test(output)) {
    const safetyLine =
      language === "el"
        ? "Αυτή η πληροφορία είναι μη επιβεβαιωμένη φήμη — do not drop τον παίκτη μέχρι να υπάρξει επίσημη επιβεβαίωση."
        : "This claim is unverified rumor-level information — do not drop the player until an official confirmation exists.";
    output = `${output}\n\n${safetyLine}`.trim();
  }

  if (mustDoNotDrop && /insufficient verified status data/i.test(output)) {
    const explicitDenialLine =
      language === "el"
        ? "Αυτή είναι μη επιβεβαιωμένη φήμη· δεν υπάρχει επιβεβαιωμένο αποδεικτικό στοιχείο. do not drop."
        : "This is an unverified rumor; there is no confirmed evidence. do not drop.";
    if (!output.includes(explicitDenialLine)) {
      output = `${output}\n\n${explicitDenialLine}`.trim();
    }
  }

  const boilerplate = UNCERTAINTY_BOILERPLATE[language];
  if (mustCalibrate && !output.includes(boilerplate)) {
    output = `${output}\n\n${boilerplate}`.trim();
  }

  if (language === "el" && !containsGreek(output)) {
    const greekFallback = mustDoNotDrop
      ? `Η πληροφορία είναι μη επιβεβαιωμένη φήμη. do not drop τον παίκτη μέχρι επίσημη ενημέρωση. ${boilerplate}`
      : `Δεν υπάρχουν επαρκή επαληθευμένα δεδομένα για ασφαλές συμπέρασμα. ${boilerplate}`;
    output = greekFallback;
  }

  return output;
};

/**
 * Returns true if this user message warrants compliance post-processing.
 * Use to avoid the (minor) overhead on unrelated queries.
 */
export const requiresComplianceProcessing = (
  message: string,
  language: SupportedLanguage
): boolean =>
  language === "el" ||
  needsDoNotDropEnforcement(message) ||
  needsUncertaintyCalibration(message);
