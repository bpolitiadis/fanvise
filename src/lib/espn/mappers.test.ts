/**
 * Unit tests for ESPN Data Mappers
 *
 * Validates that raw ESPN API JSON is correctly transformed into
 * FanVise domain objects, catching regressions in field mapping,
 * team name resolution, and data sanitization.
 */

import { describe, it, expect } from "vitest";
import { mapEspnLeagueData, resolveTeamName } from "./mappers";
import type { EspnLeagueResponse } from "./types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const buildMockEspnResponse = (
  overrides: Partial<EspnLeagueResponse> = {}
): EspnLeagueResponse => ({
  id: 12345,
  seasonId: 2026,
  scoringPeriodId: 120,
  firstScoringPeriod: 1,
  finalScoringPeriod: 170,
  segmentId: 0,
  status: { isActive: true, currentMatchupPeriod: 15 },
  settings: {
    name: "Test League",
    scoringSettings: { scoringItems: [{ statId: 0, points: 1 }] },
    rosterSettings: { lineupSlotCounts: { "0": 1, "1": 1, "4": 1, "11": 3, "12": 3 } },
  },
  teams: [
    {
      id: 1,
      location: "Alpha",
      nickname: "Wolves",
      abbrev: "AW",
      owners: ["{OWNER-1}"],
      record: {
        overall: {
          wins: 10,
          losses: 5,
          ties: 0,
          pointsFor: 1234.56,
          pointsAgainst: 1100.789,
        },
      },
      roster: {
        entries: [
          {
            playerId: 3032,
            playerPoolEntry: {
              id: 3032,
              player: {
                id: 3032,
                fullName: "LeBron James",
                firstName: "LeBron",
                lastName: "James",
                defaultPositionId: 3,
                proTeamId: 13,
              },
            },
          },
        ],
      },
    },
    {
      id: 2,
      location: "Beta",
      nickname: "Hawks",
      abbrev: "BH",
      owners: ["{OWNER-2}"],
      record: {
        overall: {
          wins: 8,
          losses: 7,
          ties: 0,
          pointsFor: 1100.0,
          pointsAgainst: 1150.333,
        },
      },
    },
  ],
  members: [
    { id: "{OWNER-1}", firstName: "John", lastName: "Doe" },
    { id: "{OWNER-2}", firstName: "Jane", lastName: "Smith" },
  ],
  draftDetail: { drafted: true, inProgress: false },
  ...overrides,
});

// ─── resolveTeamName ──────────────────────────────────────────────────────────

describe("resolveTeamName", () => {
  it("prefers location + nickname when both present", () => {
    expect(resolveTeamName({ location: "Alpha", nickname: "Wolves", name: "Legacy Name", id: 1 }))
      .toBe("Alpha Wolves");
  });

  it("falls back to name when location/nickname missing", () => {
    expect(resolveTeamName({ name: "My Custom Team", id: 1 })).toBe("My Custom Team");
  });

  it("falls back to Team {id} when everything missing", () => {
    expect(resolveTeamName({ id: 7 })).toBe("Team 7");
  });

  it("handles empty strings as falsy", () => {
    expect(resolveTeamName({ location: "", nickname: "", name: "Fallback", id: 1 }))
      .toBe("Fallback");
  });

  it("handles undefined id gracefully", () => {
    expect(resolveTeamName({})).toBe("Team ?");
  });
});

// ─── mapEspnLeagueData ───────────────────────────────────────────────────────

describe("mapEspnLeagueData", () => {
  it("maps league name from settings", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data);
    expect(result.name).toBe("Test League");
  });

  it("falls back to 'League {id}' when name missing", () => {
    const data = buildMockEspnResponse();
    data.settings!.name = undefined;
    const result = mapEspnLeagueData(data);
    expect(result.name).toBe("League 12345");
  });

  it("maps the correct number of teams", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data);
    expect(result.teams).toHaveLength(2);
  });

  it("constructs team names from location + nickname", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data);
    expect(result.teams[0].name).toBe("Alpha Wolves");
    expect(result.teams[1].name).toBe("Beta Hawks");
  });

  it("maps wins, losses, ties from record.overall", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data);
    expect(result.teams[0].wins).toBe(10);
    expect(result.teams[0].losses).toBe(5);
    expect(result.teams[0].ties).toBe(0);
  });

  it("maps pointsFor and pointsAgainst with 2-decimal rounding", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data);
    expect(result.teams[0].pointsFor).toBe(1234.56);
    expect(result.teams[0].pointsAgainst).toBe(1100.79);
    expect(result.teams[1].pointsAgainst).toBe(1150.33);
  });

  it("defaults pointsFor/pointsAgainst to 0 when missing", () => {
    const data = buildMockEspnResponse();
    data.teams![1].record = undefined;
    const result = mapEspnLeagueData(data);
    expect(result.teams[1].pointsFor).toBe(0);
    expect(result.teams[1].pointsAgainst).toBe(0);
  });

  it("resolves manager name from members array", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data);
    expect(result.teams[0].manager).toBe("John Doe");
    expect(result.teams[1].manager).toBe("Jane Smith");
  });

  it("defaults manager to 'Unknown' when no member matches", () => {
    const data = buildMockEspnResponse();
    data.members = [];
    const result = mapEspnLeagueData(data);
    expect(result.teams[0].manager).toBe("Unknown");
  });

  it("sets is_user_owned correctly based on SWID", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data, "{OWNER-1}");
    expect(result.teams[0].is_user_owned).toBe(true);
    expect(result.teams[1].is_user_owned).toBe(false);
  });

  it("trims SWID whitespace for ownership check", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data, "  {OWNER-1}  ");
    expect(result.teams[0].is_user_owned).toBe(true);
  });

  it("sets all is_user_owned to false when SWID is empty string", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data, "");
    expect(result.teams[0].is_user_owned).toBe(false);
    expect(result.teams[1].is_user_owned).toBe(false);
  });

  it("sets all is_user_owned to false when SWID is undefined", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data);
    expect(result.teams[0].is_user_owned).toBe(false);
  });

  it("maps team abbreviations", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data);
    expect(result.teams[0].abbrev).toBe("AW");
  });

  it("handles missing record gracefully (defaults to 0)", () => {
    const data = buildMockEspnResponse();
    data.teams![0].record = undefined;
    const result = mapEspnLeagueData(data);
    expect(result.teams[0].wins).toBe(0);
    expect(result.teams[0].losses).toBe(0);
    expect(result.teams[0].ties).toBe(0);
  });

  it("preserves draftDetail from top-level response", () => {
    const data = buildMockEspnResponse();
    const result = mapEspnLeagueData(data);
    expect(result.draftDetail).toEqual({ drafted: true, inProgress: false });
  });

  it("enriches draft picks with player names from roster", () => {
    const data = buildMockEspnResponse();
    (data.draftDetail as Record<string, unknown>).picks = [
      { playerId: 3032, round: 1, pick: 1 },
      { playerId: 9999, round: 1, pick: 2 },
    ];
    const result = mapEspnLeagueData(data);
    const picks = (result.draftDetail as { picks: Array<{ playerName?: string }> }).picks;
    expect(picks[0].playerName).toBe("LeBron James");
    // Player 9999 not in roster, pick unchanged
    expect(picks[1].playerName).toBeUndefined();
  });

  it("maps empty teams array without crashing", () => {
    const data = buildMockEspnResponse({ teams: [] });
    const result = mapEspnLeagueData(data);
    expect(result.teams).toEqual([]);
  });

  it("maps undefined teams array without crashing", () => {
    const data = buildMockEspnResponse({ teams: undefined });
    const result = mapEspnLeagueData(data);
    expect(result.teams).toEqual([]);
  });
});
