import { z } from "zod";

export const settingsSchema = z.object({
  gemini_api_key: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || (val.length >= 30 && val.length <= 200),
      "Gemini API key must be between 30 and 200 characters."
    ),
  espn_league_id: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || /^\d+$/.test(val),
      "ESPN League ID must contain only numbers."
    ),
  espn_team_id: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || /^\d+$/.test(val),
      "ESPN Team ID must contain only numbers."
    ),
});

export type SettingsSchema = z.infer<typeof settingsSchema>;
