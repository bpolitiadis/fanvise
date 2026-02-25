/**
 * Unit tests for ESPN Constants
 *
 * Validates stat, position, and pro team mappings match the ESPN API reference.
 * These tests catch silent breaking changes if someone modifies the constant maps.
 */

import { describe, it, expect } from "vitest";
import {
  ESPN_STAT_MAPPINGS,
  ESPN_POSITION_MAPPINGS,
  ESPN_PRO_TEAM_MAP,
  getPositionName,
  getStatName,
} from "./constants";

describe("ESPN_STAT_MAPPINGS", () => {
  it("maps core stat IDs correctly", () => {
    expect(ESPN_STAT_MAPPINGS[0]).toContain("PTS");
    expect(ESPN_STAT_MAPPINGS[1]).toContain("BLK");
    expect(ESPN_STAT_MAPPINGS[2]).toContain("STL");
    expect(ESPN_STAT_MAPPINGS[3]).toContain("AST");
    expect(ESPN_STAT_MAPPINGS[6]).toContain("REB");
    expect(ESPN_STAT_MAPPINGS[11]).toContain("TO");
    expect(ESPN_STAT_MAPPINGS[13]).toContain("FGM");
    expect(ESPN_STAT_MAPPINGS[14]).toContain("FGA");
    expect(ESPN_STAT_MAPPINGS[15]).toContain("FTM");
    expect(ESPN_STAT_MAPPINGS[16]).toContain("FTA");
    expect(ESPN_STAT_MAPPINGS[17]).toContain("3PM");
    expect(ESPN_STAT_MAPPINGS[40]).toContain("MIN");
    expect(ESPN_STAT_MAPPINGS[42]).toContain("GP");
  });

  it("covers all nine-cat stats", () => {
    const nineCatIds = [0, 1, 2, 3, 6, 11, 17, 19, 20];
    for (const id of nineCatIds) {
      expect(ESPN_STAT_MAPPINGS[id]).toBeDefined();
    }
  });
});

describe("ESPN_POSITION_MAPPINGS", () => {
  it("maps primary positions (0=PG through 4=C)", () => {
    expect(ESPN_POSITION_MAPPINGS[0]).toBe("PG");
    expect(ESPN_POSITION_MAPPINGS[1]).toBe("SG");
    expect(ESPN_POSITION_MAPPINGS[2]).toBe("SF");
    expect(ESPN_POSITION_MAPPINGS[3]).toBe("PF");
    expect(ESPN_POSITION_MAPPINGS[4]).toBe("C");
  });

  it("maps composite positions", () => {
    expect(ESPN_POSITION_MAPPINGS[5]).toBe("G");
    expect(ESPN_POSITION_MAPPINGS[6]).toBe("F");
    expect(ESPN_POSITION_MAPPINGS[7]).toBe("SG/SF");
    expect(ESPN_POSITION_MAPPINGS[8]).toBe("G/F");
    expect(ESPN_POSITION_MAPPINGS[9]).toBe("PF/C");
    expect(ESPN_POSITION_MAPPINGS[10]).toBe("F/C");
  });

  it("maps special slots", () => {
    expect(ESPN_POSITION_MAPPINGS[11]).toBe("UTIL");
    expect(ESPN_POSITION_MAPPINGS[12]).toBe("BENCH");
    expect(ESPN_POSITION_MAPPINGS[13]).toBe("IR");
  });
});

describe("ESPN_PRO_TEAM_MAP", () => {
  it("maps all 30 NBA teams plus FA", () => {
    expect(Object.keys(ESPN_PRO_TEAM_MAP).length).toBeGreaterThanOrEqual(31);
    expect(ESPN_PRO_TEAM_MAP[0]).toBe("FA");
  });

  it("maps well-known team IDs", () => {
    expect(ESPN_PRO_TEAM_MAP[2]).toBe("BOS");
    expect(ESPN_PRO_TEAM_MAP[9]).toBe("GSW");
    expect(ESPN_PRO_TEAM_MAP[13]).toBe("LAL");
    expect(ESPN_PRO_TEAM_MAP[17]).toBe("BKN");
    expect(ESPN_PRO_TEAM_MAP[18]).toBe("NYK");
    expect(ESPN_PRO_TEAM_MAP[25]).toBe("OKC");
  });
});

describe("getPositionName", () => {
  it("resolves known position IDs", () => {
    expect(getPositionName(0)).toBe("PG");
    expect(getPositionName(11)).toBe("UTIL");
  });

  it("handles string input", () => {
    expect(getPositionName("4")).toBe("C");
  });

  it("returns raw string for unknown IDs", () => {
    expect(getPositionName(99)).toBe("99");
  });
});

describe("getStatName", () => {
  it("resolves known stat IDs", () => {
    expect(getStatName(0)).toContain("PTS");
  });

  it("returns fallback for unknown stat IDs", () => {
    expect(getStatName(999)).toBe("Stat ID: 999");
  });
});
