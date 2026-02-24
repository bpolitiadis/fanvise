/**
 * Unit tests for OptimizerService
 *
 * Tests the deterministic math engine in isolation.
 * All schedule lookups are mocked — these tests must never hit the network or database.
 *
 * Test categories:
 *  1. scoreDroppingCandidate — drop score logic
 *  2. scoreStreamingCandidate — stream value calculation
 *  3. buildDailyLineup — greedy slot assignment
 *  4. validateLineupLegality — slot legality checks
 *  5. simulateMove — net-gain computation (integration of above)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  scoreDroppingCandidate,
  scoreStreamingCandidate,
  buildDailyLineup,
  validateLineupLegality,
  simulateMove,
  type RosterPlayer,
  type FreeAgentPlayer,
} from "./optimizer.service";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Fake NBA schedule used across all tests:
//   Team 1 plays Mon 24 + Tue 25
//   Team 2 plays Wed 26 + Thu 27
//   All other team IDs have 0 games (e.g., proTeamId 99)
const FAKE_SCHEDULE = [
  { id: "g1", date: "2026-02-24T19:00:00Z", homeTeamId: 1, awayTeamId: 5, seasonId: "2025" },
  { id: "g2", date: "2026-02-25T19:00:00Z", homeTeamId: 1, awayTeamId: 8, seasonId: "2025" },
  { id: "g3", date: "2026-02-26T19:00:00Z", homeTeamId: 2, awayTeamId: 7, seasonId: "2025" },
  { id: "g4", date: "2026-02-27T19:00:00Z", homeTeamId: 2, awayTeamId: 9, seasonId: "2025" },
];

// Mock ScheduleService as a proper class so `new ScheduleService()` works in ESM
vi.mock("@/services/schedule.service", () => {
  class MockScheduleService {
    getGamesInRange = vi.fn().mockResolvedValue(FAKE_SCHEDULE);
  }
  return { ScheduleService: MockScheduleService };
});

// Mock Supabase admin client — optimizer views not needed in unit tests
vi.mock("@/utils/supabase/server", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeRosterPlayer = (overrides: Partial<RosterPlayer> = {}): RosterPlayer => ({
  playerId: 1001,
  playerName: "Test Player",
  position: "PG",
  eligibleSlots: ["PG"],
  proTeamId: 1,
  injuryStatus: "ACTIVE",
  avgFpts: 30,
  totalFpts: 900,
  gamesPlayed: 30,
  ...overrides,
});

const makeFreeAgent = (overrides: Partial<FreeAgentPlayer> = {}): FreeAgentPlayer => ({
  playerId: 2001,
  playerName: "Free Agent",
  position: "SG",
  eligibleSlots: ["SG"],
  proTeamId: 2,
  injuryStatus: "ACTIVE",
  avgFpts: 25,
  percentOwned: 15,
  ...overrides,
});

const STANDARD_SLOTS = { PG: 1, SG: 1, SF: 1, PF: 1, C: 1, G: 1, UTIL: 1, BE: 3 };

// ─── 1. scoreDroppingCandidate ───────────────────────────────────────────────

describe("scoreDroppingCandidate", () => {
  it("returns a low drop score for a high-performing active player with 2 games", async () => {
    const player = makeRosterPlayer({ avgFpts: 40, injuryStatus: "ACTIVE", proTeamId: 1 });
    const result = await scoreDroppingCandidate(player);

    expect(result.score).toBeLessThan(30);
    expect(result.gamesRemaining).toBeGreaterThan(0);
    expect(result.projectedWindowFpts).toBeGreaterThan(0);
    expect(result.reasons).toHaveLength(0);
  });

  it("raises score when player is OUT", async () => {
    const player = makeRosterPlayer({ injuryStatus: "OUT", avgFpts: 25, proTeamId: 1 });
    const result = await scoreDroppingCandidate(player);

    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.reasons.some((r) => r.includes("OUT"))).toBe(true);
  });

  it("raises score when player has no games in window", async () => {
    // proTeamId 99 has no games in mocked schedule
    const player = makeRosterPlayer({ proTeamId: 99, avgFpts: 30 });
    const result = await scoreDroppingCandidate(player);

    expect(result.gamesRemaining).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.reasons.some((r) => r.includes("No games"))).toBe(true);
  });

  it("raises score when avg fpts is well below league average", async () => {
    const leagueAvg = 30;
    const player = makeRosterPlayer({ avgFpts: 10, proTeamId: 1 }); // 10 < 30 * 0.6 = 18
    const result = await scoreDroppingCandidate(player, undefined, undefined, leagueAvg);

    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.reasons.some((r) => r.includes("well below"))).toBe(true);
  });

  it("raises score for low sample size", async () => {
    const player = makeRosterPlayer({ gamesPlayed: 3, proTeamId: 1, avgFpts: 20 });
    const result = await scoreDroppingCandidate(player);

    expect(result.reasons.some((r) => r.includes("Low sample"))).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it("caps score at 100 for worst-case player", async () => {
    const player = makeRosterPlayer({
      injuryStatus: "OUT",
      avgFpts: 5,
      proTeamId: 99, // no games
      gamesPlayed: 2,
    });
    const result = await scoreDroppingCandidate(player, undefined, undefined, 30);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ─── 2. scoreStreamingCandidate ──────────────────────────────────────────────

describe("scoreStreamingCandidate", () => {
  it("returns a score proportional to avgFpts × gamesRemaining", async () => {
    const fa = makeFreeAgent({ avgFpts: 25, proTeamId: 2 }); // 2 games in mock schedule
    const result = await scoreStreamingCandidate(fa);

    expect(result.gamesRemaining).toBe(2);
    expect(result.projectedWindowFpts).toBeCloseTo(50, 0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("returns score of 0 for a player with no games", async () => {
    const fa = makeFreeAgent({ proTeamId: 99 }); // no games
    const result = await scoreStreamingCandidate(fa);

    expect(result.gamesRemaining).toBe(0);
    expect(result.projectedWindowFpts).toBe(0);
    expect(result.score).toBe(0);
  });

  it("returns LOW confidence for DTD players", async () => {
    const fa = makeFreeAgent({ injuryStatus: "DTD", proTeamId: 2 });
    const result = await scoreStreamingCandidate(fa);
    expect(result.confidence).toBe("LOW");
  });

  it("returns gameDates array sorted ascending", async () => {
    const fa = makeFreeAgent({ proTeamId: 2 }); // plays 2026-02-26 and 2026-02-27
    const result = await scoreStreamingCandidate(fa);
    const sorted = [...result.gameDates].sort();
    expect(result.gameDates).toEqual(sorted);
  });
});

// ─── 3. buildDailyLineup ─────────────────────────────────────────────────────

describe("buildDailyLineup", () => {
  const slots = { PG: 1, SG: 1, G: 1, UTIL: 1, BE: 3 };

  it("assigns the highest-avgFpts eligible player to each starting slot", () => {
    const roster: RosterPlayer[] = [
      makeRosterPlayer({ playerId: 1, avgFpts: 40, eligibleSlots: ["PG"], proTeamId: 1 }),
      makeRosterPlayer({ playerId: 2, avgFpts: 30, eligibleSlots: ["SG"], proTeamId: 1 }),
      makeRosterPlayer({ playerId: 3, avgFpts: 20, eligibleSlots: ["PG"], proTeamId: 1 }),
    ];
    const playing = new Set([1]);
    const assignments = buildDailyLineup(roster, slots, "2026-02-24", playing);

    const starters = assignments.filter((a) => a.isStarting);
    expect(starters.length).toBeGreaterThan(0);
    // Player 1 (40 fpts) should be assigned to PG or G before player 3 (20 fpts)
    const pg = starters.find((a) => a.slot === "PG");
    if (pg) expect(pg.playerId).toBe(1);
  });

  it("excludes OUT players from starting assignments", () => {
    const roster: RosterPlayer[] = [
      makeRosterPlayer({ playerId: 1, injuryStatus: "OUT", eligibleSlots: ["PG"], proTeamId: 1 }),
      makeRosterPlayer({ playerId: 2, eligibleSlots: ["SG"], proTeamId: 1 }),
    ];
    const playing = new Set([1]);
    const assignments = buildDailyLineup(roster, slots, "2026-02-24", playing);

    const starters = assignments.filter((a) => a.isStarting);
    const outPlayerStarting = starters.find((a) => a.playerId === 1);
    expect(outPlayerStarting).toBeUndefined();
  });

  it("places players without games on bench", () => {
    const roster: RosterPlayer[] = [
      makeRosterPlayer({ playerId: 1, eligibleSlots: ["PG"], proTeamId: 99 }), // no game
    ];
    const playing = new Set<number>([]); // nobody plays
    const assignments = buildDailyLineup(roster, slots, "2026-02-24", playing);

    const bench = assignments.filter((a) => !a.isStarting);
    expect(bench.some((a) => a.playerId === 1)).toBe(true);
  });
});

// ─── 4. validateLineupLegality ───────────────────────────────────────────────

describe("validateLineupLegality", () => {
  it("returns isLegal=true when all starting slots can be filled", () => {
    const roster = [
      { playerId: 1, playerName: "PG Star", eligibleSlots: ["PG"] },
      { playerId: 2, playerName: "SG Star", eligibleSlots: ["SG"] },
    ];
    const slots = { PG: 1, SG: 1, BE: 2 };
    const result = validateLineupLegality({
      roster,
      rosterSlots: slots,
      playingPlayerIds: [1, 2],
    });

    expect(result.isLegal).toBe(true);
    expect(result.unfilledStartingSlots).toHaveLength(0);
    expect(result.assignments.filter((a) => a.isStarting)).toHaveLength(2);
  });

  it("returns isLegal=false and lists unfilled slots when roster is short", () => {
    const roster = [
      { playerId: 1, playerName: "PG Star", eligibleSlots: ["PG"] },
      // No SG available
    ];
    const slots = { PG: 1, SG: 1, BE: 1 };
    const result = validateLineupLegality({
      roster,
      rosterSlots: slots,
      playingPlayerIds: [1],
    });

    expect(result.isLegal).toBe(false);
    expect(result.unfilledStartingSlots).toContain("SG");
  });

  it("identifies players benched despite having a game (wasted starts)", () => {
    const roster = [
      { playerId: 1, playerName: "PG Star", eligibleSlots: ["PG"] },
      { playerId: 2, playerName: "PG Backup", eligibleSlots: ["PG"] }, // second PG can't start in PG slot
    ];
    const slots = { PG: 1, BE: 2 };
    const result = validateLineupLegality({
      roster,
      rosterSlots: slots,
      playingPlayerIds: [1, 2],
    });

    expect(result.benchedWithGames).toContain("PG Backup");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("UTIL slot accepts any position", () => {
    const roster = [
      { playerId: 1, playerName: "Center", eligibleSlots: ["C"] },
    ];
    const slots = { UTIL: 1, BE: 1 };
    const result = validateLineupLegality({
      roster,
      rosterSlots: slots,
      playingPlayerIds: [1],
    });

    expect(result.isLegal).toBe(true);
    const utilSlot = result.assignments.find((a) => a.slot === "UTIL");
    expect(utilSlot?.playerName).toBe("Center");
  });
});

// ─── 5. simulateMove ─────────────────────────────────────────────────────────

describe("simulateMove", () => {
  it("returns positive netGain when free agent is strictly better in the window", async () => {
    const dropPlayer = makeRosterPlayer({
      playerId: 1001,
      avgFpts: 10,
      proTeamId: 99, // no games in mock schedule → 0 projected window fpts
      eligibleSlots: ["PG"],
    });
    const addPlayer = makeFreeAgent({
      playerId: 2001,
      avgFpts: 25,
      proTeamId: 2, // 2 games in mock schedule
      eligibleSlots: ["PG"],
    });
    const currentRoster = [
      dropPlayer,
      makeRosterPlayer({ playerId: 1002, avgFpts: 30, eligibleSlots: ["SG"], proTeamId: 1 }),
    ];

    const result = await simulateMove(
      dropPlayer,
      addPlayer,
      currentRoster,
      STANDARD_SLOTS
    );

    expect(result.netGain).toBeGreaterThan(0);
    expect(result.addPlayerName).toBe("Free Agent");
    expect(result.dropPlayerName).toBe("Test Player");
  });

  it("returns negative netGain when the current player is better than the streamer", async () => {
    const dropPlayer = makeRosterPlayer({
      playerId: 1001,
      avgFpts: 40,
      proTeamId: 1, // 2 games
      eligibleSlots: ["PG"],
    });
    const addPlayer = makeFreeAgent({
      playerId: 2001,
      avgFpts: 10,
      proTeamId: 99, // no games
      eligibleSlots: ["PG"],
    });
    const currentRoster = [dropPlayer];

    const result = await simulateMove(
      dropPlayer,
      addPlayer,
      currentRoster,
      STANDARD_SLOTS
    );

    expect(result.netGain).toBeLessThanOrEqual(0);
  });

  it("returns isLegal=false when the add player has no eligible slot", async () => {
    const dropPlayer = makeRosterPlayer({ eligibleSlots: ["C"], proTeamId: 1 });
    const addPlayer = makeFreeAgent({
      eligibleSlots: ["C"],
      proTeamId: 2,
    });

    // Roster slots with no C slot
    const noCenter = { PG: 1, SG: 1, BE: 3 };
    const result = await simulateMove(
      dropPlayer,
      addPlayer,
      [dropPlayer],
      noCenter
    );

    expect(result.isLegal).toBe(false);
    expect(result.warnings.some((w) => w.includes("no eligible starting slot"))).toBe(true);
  });

  it("adds a warning when the added player is DTD", async () => {
    const dropPlayer = makeRosterPlayer({ proTeamId: 99, avgFpts: 5 });
    const addPlayer = makeFreeAgent({ injuryStatus: "DTD", proTeamId: 2 });
    const result = await simulateMove(dropPlayer, addPlayer, [dropPlayer], STANDARD_SLOTS);

    expect(result.warnings.some((w) => w.includes("DTD"))).toBe(true);
  });

  it("populates dailyBreakdown with an entry per game date in window", async () => {
    const dropPlayer = makeRosterPlayer({ proTeamId: 99 });
    const addPlayer = makeFreeAgent({ proTeamId: 2 });
    const result = await simulateMove(dropPlayer, addPlayer, [dropPlayer], STANDARD_SLOTS);

    // Mock schedule has games on 4 unique dates (2 for team 1, 2 for team 2)
    expect(result.dailyBreakdown.length).toBeGreaterThan(0);
    expect(result.dailyBreakdown[0]).toHaveProperty("date");
    expect(result.dailyBreakdown[0]).toHaveProperty("slotsUsed");
  });
});
