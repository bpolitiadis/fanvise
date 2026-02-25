export interface MatchupWindow {
  start: Date;
  end: Date;
}

/**
 * Returns the active fantasy matchup window:
 * - start: today at 00:00:00.000 (local time)
 * - end: this Sunday at 23:59:59.999 (local time)
 *
 * The modulo keeps Sunday anchored to the same day (not next Sunday).
 */
export const getCurrentMatchupWindow = (referenceDate: Date = new Date()): MatchupWindow => {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  const daysUntilSunday = (7 - end.getDay()) % 7;
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};
