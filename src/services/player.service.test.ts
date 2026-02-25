/**
 * Unit tests for PlayerService
 *
 * Validates that ESPN player data is correctly mapped to PlayerContext,
 * with particular focus on proTeam resolution and stat fallbacks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetFreeAgents = vi.fn();

vi.mock("@/lib/espn/client", () => ({
  EspnClient: class {
    getFreeAgents = mockGetFreeAgents;
  },
}));

import { PlayerService } from "./player.service";

describe("PlayerService", () => {
  let service: PlayerService;

  beforeEach(() => {
    mockGetFreeAgents.mockReset();
    service = new PlayerService("12345", "2026", "fba");
  });

  describe("proTeam resolution", () => {
    it("resolves numeric proTeamId to team abbreviation (LAL=13)", async () => {
      mockGetFreeAgents.mockResolvedValue([
        {
          id: 3032,
          player: {
            id: 3032,
            fullName: "LeBron James",
            firstName: "LeBron",
            lastName: "James",
            proTeamId: 13,
            defaultPositionId: 3,
            injuryStatus: "ACTIVE",
            stats: [
              { seasonId: 2026, statSourceId: 0, statSplitTypeId: 0, appliedAverage: 25.5, appliedTotal: 2550 },
            ],
          },
        },
      ]);

      const result = await service.getTopFreeAgents(10);
      expect(result).toHaveLength(1);
      expect(result[0].proTeam).toBe("LAL");
      expect(result[0].proTeamId).toBe(13);
    });

    it("resolves proTeamId=0 to 'FA'", async () => {
      mockGetFreeAgents.mockResolvedValue([
        {
          id: 1,
          player: {
            id: 1,
            fullName: "Free Agent",
            proTeamId: 0,
            defaultPositionId: 0,
            stats: [],
          },
        },
      ]);

      const result = await service.getTopFreeAgents(1);
      expect(result[0].proTeam).toBe("FA");
    });

    it("resolves known team IDs correctly", async () => {
      const testCases = [
        { proTeamId: 2, expected: "BOS" },
        { proTeamId: 9, expected: "GSW" },
        { proTeamId: 17, expected: "BKN" },
        { proTeamId: 25, expected: "OKC" },
      ];

      for (const { proTeamId, expected } of testCases) {
        mockGetFreeAgents.mockResolvedValue([
          {
            id: proTeamId,
            player: {
              id: proTeamId,
              fullName: "Test",
              proTeamId,
              defaultPositionId: 0,
              stats: [],
            },
          },
        ]);

        const result = await service.getTopFreeAgents(1);
        expect(result[0].proTeam).toBe(expected);
      }
    });

    it("falls back to string ID for unknown proTeamId", async () => {
      mockGetFreeAgents.mockResolvedValue([
        {
          id: 1,
          player: {
            id: 1,
            fullName: "Unknown Team",
            proTeamId: 999,
            defaultPositionId: 0,
            stats: [],
          },
        },
      ]);

      const result = await service.getTopFreeAgents(1);
      expect(result[0].proTeam).toBe("999");
    });
  });

  describe("position resolution", () => {
    it("resolves defaultPositionId to position name", async () => {
      mockGetFreeAgents.mockResolvedValue([
        {
          id: 1,
          player: {
            id: 1,
            fullName: "Test PG",
            proTeamId: 2,
            defaultPositionId: 0,
            stats: [],
          },
        },
      ]);

      const result = await service.getTopFreeAgents(1);
      expect(result[0].position).toBe("PG");
    });
  });

  describe("stat selection", () => {
    it("prefers actual season stats over projected", async () => {
      mockGetFreeAgents.mockResolvedValue([
        {
          id: 1,
          player: {
            id: 1,
            fullName: "Test",
            proTeamId: 2,
            defaultPositionId: 0,
            stats: [
              { seasonId: 2026, statSourceId: 0, statSplitTypeId: 0, appliedAverage: 30.0, appliedTotal: 3000 },
              { seasonId: 2026, statSourceId: 1, statSplitTypeId: 0, appliedAverage: 25.0, appliedTotal: 2500 },
            ],
          },
        },
      ]);

      const result = await service.getTopFreeAgents(1);
      expect(result[0].avgPoints).toBe(30.0);
      expect(result[0].totalPoints).toBe(3000);
    });

    it("falls back to projected stats when actuals missing", async () => {
      mockGetFreeAgents.mockResolvedValue([
        {
          id: 1,
          player: {
            id: 1,
            fullName: "Rookie",
            proTeamId: 2,
            defaultPositionId: 0,
            stats: [
              { seasonId: 2026, statSourceId: 1, statSplitTypeId: 0, appliedAverage: 20.0, appliedTotal: 2000 },
            ],
          },
        },
      ]);

      const result = await service.getTopFreeAgents(1);
      expect(result[0].avgPoints).toBe(20.0);
    });

    it("defaults to 0 when no stats exist", async () => {
      mockGetFreeAgents.mockResolvedValue([
        {
          id: 1,
          player: {
            id: 1,
            fullName: "No Stats",
            proTeamId: 2,
            defaultPositionId: 0,
            stats: [],
          },
        },
      ]);

      const result = await service.getTopFreeAgents(1);
      expect(result[0].avgPoints).toBe(0);
      expect(result[0].totalPoints).toBe(0);
    });
  });

  describe("ownership mapping", () => {
    it("maps ownership data when present", async () => {
      mockGetFreeAgents.mockResolvedValue([
        {
          id: 1,
          player: {
            id: 1,
            fullName: "Popular",
            proTeamId: 9,
            defaultPositionId: 0,
            stats: [],
            ownership: {
              percentOwned: 85.5,
              percentChange: 2.3,
              percentStarted: 72.1,
            },
          },
        },
      ]);

      const result = await service.getTopFreeAgents(1);
      expect(result[0].ownership).toEqual({
        percentOwned: 85.5,
        percentChange: 2.3,
        percentStarted: 72.1,
      });
    });

    it("leaves ownership undefined when not present", async () => {
      mockGetFreeAgents.mockResolvedValue([
        {
          id: 1,
          player: {
            id: 1,
            fullName: "No Ownership",
            proTeamId: 2,
            defaultPositionId: 0,
            stats: [],
          },
        },
      ]);

      const result = await service.getTopFreeAgents(1);
      expect(result[0].ownership).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("returns empty array on ESPN client error", async () => {
      mockGetFreeAgents.mockRejectedValue(new Error("ESPN 401"));
      const result = await service.getTopFreeAgents(10);
      expect(result).toEqual([]);
    });
  });
});
