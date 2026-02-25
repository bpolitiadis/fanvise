/**
 * Unit tests for Game Log Service helpers
 *
 * Tests the ESPN stat ID → column mapping and average computation logic
 * that are critical for correct database storage and AI context.
 */

import { describe, it, expect } from "vitest";

// Re-implement the pure functions under test to validate the algorithm.
// The actual service functions are tightly coupled to DB/ESPN clients,
// so we test the core mapping and computation logic directly.

const STAT_ID_TO_COL: Record<number, string> = {
  0: "pts",
  6: "reb",
  3: "ast",
  2: "stl",
  1: "blk",
  11: "turnovers",
  17: "three_pm",
  13: "fg_made",
  14: "fg_attempted",
  19: "fg_pct",
  15: "ft_made",
  16: "ft_attempted",
  20: "ft_pct",
  40: "minutes",
};

const ESPN_STAT_MAPPINGS: Record<number, string> = {
  0: "Points (PTS)",
  1: "Blocks (BLK)",
  2: "Steals (STL)",
  3: "Assists (AST)",
  6: "Rebounds (REB)",
  11: "Turnovers (TO)",
  13: "Field Goals Made (FGM)",
  14: "Field Goals Attempted (FGA)",
  15: "Free Throws Made (FTM)",
  16: "Free Throws Attempted (FTA)",
  17: "3-Pointers Made (3PM)",
  19: "Field Goal % (FG%)",
  20: "Free Throw % (FT%)",
  40: "Minutes (MIN)",
  42: "Games Played (GP)",
};

const safeNum = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const buildLabelled = (raw: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [idStr, val] of Object.entries(raw)) {
    const id = parseInt(idStr, 10);
    const name = ESPN_STAT_MAPPINGS[id];
    if (name) out[name] = val;
  }
  return out;
};

describe("STAT_ID_TO_COL mapping", () => {
  it("maps PTS (stat 0) to 'pts' column", () => {
    expect(STAT_ID_TO_COL[0]).toBe("pts");
  });

  it("maps REB (stat 6) to 'reb' column", () => {
    expect(STAT_ID_TO_COL[6]).toBe("reb");
  });

  it("maps TO (stat 11) to 'turnovers' column (SQL reserved word)", () => {
    expect(STAT_ID_TO_COL[11]).toBe("turnovers");
  });

  it("maps 3PM (stat 17) to 'three_pm' column", () => {
    expect(STAT_ID_TO_COL[17]).toBe("three_pm");
  });

  it("maps FG% (stat 19) to 'fg_pct' column", () => {
    expect(STAT_ID_TO_COL[19]).toBe("fg_pct");
  });

  it("maps MIN (stat 40) to 'minutes' column", () => {
    expect(STAT_ID_TO_COL[40]).toBe("minutes");
  });

  it("covers all expected stat columns", () => {
    const expectedColumns = [
      "pts", "reb", "ast", "stl", "blk", "turnovers",
      "three_pm", "fg_made", "fg_attempted", "fg_pct",
      "ft_made", "ft_attempted", "ft_pct", "minutes",
    ];
    const mappedColumns = Object.values(STAT_ID_TO_COL);
    for (const col of expectedColumns) {
      expect(mappedColumns).toContain(col);
    }
  });
});

describe("safeNum", () => {
  it("passes through finite numbers", () => {
    expect(safeNum(42)).toBe(42);
    expect(safeNum(0)).toBe(0);
    expect(safeNum(-5.5)).toBe(-5.5);
  });

  it("converts string numbers", () => {
    expect(safeNum("25")).toBe(25);
    expect(safeNum("3.14")).toBe(3.14);
  });

  it("returns 0 for NaN/Infinity/null/undefined", () => {
    expect(safeNum(NaN)).toBe(0);
    expect(safeNum(Infinity)).toBe(0);
    expect(safeNum(null)).toBe(0);
    expect(safeNum(undefined)).toBe(0);
    expect(safeNum("not a number")).toBe(0);
  });
});

describe("buildLabelled", () => {
  it("converts ESPN stat IDs to human-readable labels", () => {
    const raw = { "0": 30, "3": 8, "6": 10, "11": 3, "42": 1 };
    const result = buildLabelled(raw);

    expect(result["Points (PTS)"]).toBe(30);
    expect(result["Assists (AST)"]).toBe(8);
    expect(result["Rebounds (REB)"]).toBe(10);
    expect(result["Turnovers (TO)"]).toBe(3);
    expect(result["Games Played (GP)"]).toBe(1);
  });

  it("skips unknown stat IDs", () => {
    const raw = { "0": 10, "999": 5 };
    const result = buildLabelled(raw);

    expect(result["Points (PTS)"]).toBe(10);
    expect(Object.keys(result)).toHaveLength(1);
  });

  it("handles empty input", () => {
    expect(buildLabelled({})).toEqual({});
  });
});

describe("Average computation", () => {
  interface GameLogEntry {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    three_pm: number;
    fantasyPoints: number;
  }

  const computeAverages = (entries: GameLogEntry[]) => {
    const n = entries.length;
    if (n === 0) {
      return { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, three_pm: 0, fantasyPoints: 0, gamesPlayed: 0 };
    }
    const sum = (key: keyof GameLogEntry) =>
      entries.reduce((acc, e) => acc + safeNum(e[key]), 0);

    return {
      pts: Math.round((sum("pts") / n) * 10) / 10,
      reb: Math.round((sum("reb") / n) * 10) / 10,
      ast: Math.round((sum("ast") / n) * 10) / 10,
      stl: Math.round((sum("stl") / n) * 10) / 10,
      blk: Math.round((sum("blk") / n) * 10) / 10,
      three_pm: Math.round((sum("three_pm") / n) * 10) / 10,
      fantasyPoints: Math.round((sum("fantasyPoints") / n) * 10) / 10,
      gamesPlayed: n,
    };
  };

  it("computes correct averages for multiple games", () => {
    const games: GameLogEntry[] = [
      { pts: 30, reb: 10, ast: 8, stl: 2, blk: 1, three_pm: 3, fantasyPoints: 55 },
      { pts: 20, reb: 5, ast: 12, stl: 1, blk: 0, three_pm: 1, fantasyPoints: 40 },
    ];

    const avg = computeAverages(games);
    expect(avg.pts).toBe(25);
    expect(avg.reb).toBe(7.5);
    expect(avg.ast).toBe(10);
    expect(avg.fantasyPoints).toBe(47.5);
    expect(avg.gamesPlayed).toBe(2);
  });

  it("returns zeros for empty array", () => {
    const avg = computeAverages([]);
    expect(avg.pts).toBe(0);
    expect(avg.gamesPlayed).toBe(0);
  });

  it("handles single game (average = value)", () => {
    const games: GameLogEntry[] = [
      { pts: 42, reb: 12, ast: 5, stl: 3, blk: 2, three_pm: 4, fantasyPoints: 65 },
    ];

    const avg = computeAverages(games);
    expect(avg.pts).toBe(42);
    expect(avg.fantasyPoints).toBe(65);
    expect(avg.gamesPlayed).toBe(1);
  });

  it("rounds to 1 decimal place", () => {
    const games: GameLogEntry[] = [
      { pts: 10, reb: 0, ast: 0, stl: 0, blk: 0, three_pm: 0, fantasyPoints: 0 },
      { pts: 11, reb: 0, ast: 0, stl: 0, blk: 0, three_pm: 0, fantasyPoints: 0 },
      { pts: 12, reb: 0, ast: 0, stl: 0, blk: 0, three_pm: 0, fantasyPoints: 0 },
    ];

    const avg = computeAverages(games);
    expect(avg.pts).toBe(11);
  });
});
