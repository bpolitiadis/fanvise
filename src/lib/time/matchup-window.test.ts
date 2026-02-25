import { describe, expect, it } from "vitest";
import { getCurrentMatchupWindow } from "./matchup-window";

describe("getCurrentMatchupWindow", () => {
  it("starts at local start-of-day and ends on the same week's Sunday", () => {
    const reference = new Date("2026-02-25T14:30:00.000Z"); // Wednesday
    const window = getCurrentMatchupWindow(reference);

    expect(window.start.getHours()).toBe(0);
    expect(window.start.getMinutes()).toBe(0);
    expect(window.start.getSeconds()).toBe(0);
    expect(window.start.getMilliseconds()).toBe(0);

    expect(window.end.getDay()).toBe(0);
    expect(window.end.getHours()).toBe(23);
    expect(window.end.getMinutes()).toBe(59);
    expect(window.end.getSeconds()).toBe(59);
    expect(window.end.getMilliseconds()).toBe(999);
  });

  it("does not spill into next week when reference day is Sunday", () => {
    const reference = new Date("2026-03-01T10:00:00.000Z"); // Sunday
    const window = getCurrentMatchupWindow(reference);

    expect(window.start.getDay()).toBe(0);
    expect(window.end.getDay()).toBe(0);

    const daysBetween = Math.floor(
      (window.end.getTime() - window.start.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(daysBetween).toBe(0);
  });
});
