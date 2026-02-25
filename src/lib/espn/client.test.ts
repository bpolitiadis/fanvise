/**
 * Unit tests for EspnClient
 *
 * Tests constructor defaults, URL building, and header construction.
 * Network calls are mocked — these tests validate request formation only.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EspnClient } from "./client";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EspnClient constructor", () => {
  it("defaults sport to 'fba' (basketball, not football)", () => {
    const client = new EspnClient("12345", "2026");
    // Verify by calling a method and checking the URL
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ settings: {} })),
    });

    // Access private fields via the URL generated in fetch calls
    client.getLeagueSettings().catch(() => {});

    // Wait for the first fetch call
    expect(mockFetch).toHaveBeenCalled();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/fba/");
    expect(url).not.toContain("/ffl/");
  });

  it("allows overriding sport", () => {
    const client = new EspnClient("12345", "2026", "ffl");
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ settings: {} })),
    });

    client.getLeagueSettings().catch(() => {});
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/ffl/");
  });
});

describe("EspnClient URL building", () => {
  const client = new EspnClient("99999", "2026", "fba");

  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ settings: {}, teams: [], members: [] })),
      json: () => Promise.resolve({ settings: {}, teams: [], members: [], schedule: [], players: [] }),
    });
  });

  it("builds league URL with correct base pattern", async () => {
    await client.getLeagueSettings().catch(() => {});
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2026/segments/0/leagues/99999");
  });

  it("includes mSettings, mTeam, mRoster views in league settings call", async () => {
    await client.getLeagueSettings().catch(() => {});
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("view=mSettings");
    expect(url).toContain("view=mTeam");
    expect(url).toContain("view=mRoster");
  });

  it("includes scoringPeriodId in matchup URL when provided", async () => {
    await client.getMatchups(120);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("scoringPeriodId=120");
  });

  it("omits scoringPeriodId from matchup URL when not provided", async () => {
    await client.getMatchups();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain("scoringPeriodId");
  });

  it("builds pro schedule URL at season level (no segments/leagues)", async () => {
    await client.getProTeamSchedules();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/games/fba/seasons/2026?");
    expect(url).toContain("view=proTeamSchedules_wl");
    expect(url).not.toContain("segments");
    expect(url).not.toContain("leagues");
  });
});

describe("EspnClient auth headers", () => {
  it("includes Cookie header when SWID and S2 provided", async () => {
    const client = new EspnClient("12345", "2026", "fba", "{MY-SWID}", "my-s2-token");
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ settings: {}, teams: [], members: [] })),
    });

    await client.getLeagueSettings().catch(() => {});
    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Cookie).toContain("swid={MY-SWID}");
    expect(headers.Cookie).toContain("espn_s2=my-s2-token");
  });

  it("omits Cookie header when SWID/S2 not provided", async () => {
    const client = new EspnClient("12345", "2026", "fba");
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ settings: {}, teams: [], members: [] })),
    });

    await client.getLeagueSettings().catch(() => {});
    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Cookie).toBeUndefined();
  });
});

describe("EspnClient error handling", () => {
  it("throws on non-OK HTTP response", async () => {
    const client = new EspnClient("12345", "2026", "fba");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("Private league"),
    });

    await expect(client.getLeagueSettings()).rejects.toThrow("ESPN API Error: 401");
  });

  it("throws on invalid JSON response", async () => {
    const client = new EspnClient("12345", "2026", "fba");
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("not json at all"),
    });

    await expect(client.getLeagueSettings()).rejects.toThrow("Invalid JSON");
  });
});

describe("EspnClient.getFreeAgents", () => {
  it("sets x-fantasy-filter header with correct structure", async () => {
    const client = new EspnClient("12345", "2026", "fba");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ players: [] }),
    });

    await client.getFreeAgents(25, 0);
    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    const filter = JSON.parse(headers["x-fantasy-filter"]);

    expect(filter.players.filterStatus.value).toEqual(["FREEAGENT", "WAIVERS"]);
    expect(filter.players.limit).toBe(25);
    expect(filter.players.filterSlotIds.value).toEqual([0]);
  });

  it("omits filterSlotIds when no position specified", async () => {
    const client = new EspnClient("12345", "2026", "fba");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ players: [] }),
    });

    await client.getFreeAgents(50);
    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    const filter = JSON.parse(headers["x-fantasy-filter"]);

    expect(filter.players.filterSlotIds).toBeUndefined();
  });
});

describe("EspnClient.getPlayerGameLog", () => {
  it("returns empty array for empty playerIds", async () => {
    const client = new EspnClient("12345", "2026", "fba");
    const result = await client.getPlayerGameLog([]);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("filters to actual per-period stats only", async () => {
    const client = new EspnClient("12345", "2026", "fba");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          players: [
            {
              id: 3032,
              player: {
                fullName: "LeBron James",
                proTeamId: 13,
                stats: [
                  { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 120, appliedTotal: 45.2, stats: { "0": 30 } },
                  { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 119, appliedTotal: 38.0, stats: { "0": 25 } },
                  { statSourceId: 1, statSplitTypeId: 0, scoringPeriodId: 120, appliedTotal: 40.0, stats: {} },
                  { statSourceId: 0, statSplitTypeId: 0, seasonId: 2026, appliedTotal: 3000.0, stats: {} },
                ],
              },
            },
          ],
        }),
    });

    const result = await client.getPlayerGameLog([3032], 10);
    expect(result).toHaveLength(1);
    expect(result[0].stats).toHaveLength(2);
    expect(result[0].stats[0].scoringPeriodId).toBe(120);
    expect(result[0].stats[1].scoringPeriodId).toBe(119);
  });
});
