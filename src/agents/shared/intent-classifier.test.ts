/**
 * Unit tests for the deterministic intent classifier.
 *
 * This is a critical function — it gates the Supervisor routing.
 * A misclassification sends a query down the wrong execution path.
 *
 * Priority order: matchup_analysis → free_agent_scan → lineup_optimization
 *                 → player_research → general_advice
 *
 * Every case here documents a deliberate routing decision.
 */

import { describe, it, expect } from "vitest";
import { classifyIntent } from "./intent-classifier";

// ─── lineup_optimization ──────────────────────────────────────────────────────

describe("classifyIntent → lineup_optimization", () => {
  it.each([
    "optimize my lineup for this week",
    "help me set my lineup",
    "who should I start today",
    "should I start Kawhi or drop him",
    "start or sit Jaylen Brown",
    "sit or start LeBron tonight",
    "who do I start vs PHX",
    "drop LeBron and add Caruso",
    "should I add Caruso or drop him",
    "lineup help for tonight",
    "my remaining games this week",
    "waiver pickup this week",
    "optimize",
    "best lineup setup",
    "who can I drop from my roster",
    "should I drop this player",
    "daily lineup decisions",
    "roster decision help",
    "who to drop this week",
  ])('"%s"', (query) => {
    expect(classifyIntent(query)).toBe("lineup_optimization");
  });
});

// ─── player_research ──────────────────────────────────────────────────────────

describe("classifyIntent → player_research", () => {
  it.each([
    "is Giannis injured",
    "what is LeBron's injury status",
    "is Jokic day-to-day",
    "Kawhi Leonard GTD tonight",
    "when will Embiid return",
    "latest news on Luka",
    "update on Steph Curry",
    "is KD available tonight",
    "is Tatum playing",
    "Kyrie Irving DTD report",
    "will Ja Morant play tonight",
    "how has LeBron been lately",
    "Tyrese Haliburton recent form",
    "is Booker worth starting",
  ])('"%s"', (query) => {
    expect(classifyIntent(query)).toBe("player_research");
  });
});

// ─── free_agent_scan ──────────────────────────────────────────────────────────

describe("classifyIntent → free_agent_scan", () => {
  it.each([
    "who is on the waiver wire",
    "best available free agents",
    "top available players",
    "who should I pick up",
    "who can I grab off waivers",
    "who should I add this week",
    "who to add this week",
    "waivers check",
    "best add on the waiver wire",
    // streaming is waiver-browsing, not optimizer territory
    "streaming options this week",
    "best streamers for the rest of the week",
    "who should I stream tonight",
    "suggest free agents to stream to secure the win",
  ])('"%s"', (query) => {
    expect(classifyIntent(query)).toBe("free_agent_scan");
  });
});

// ─── matchup_analysis ────────────────────────────────────────────────────────

describe("classifyIntent → matchup_analysis", () => {
  it.each([
    "how is my matchup going",
    "am I winning this week",
    "am I losing my matchup",
    "what is my current score",
    "how many points am I behind",
    "my score vs my opponent",
    "this week score breakdown",
  ])('"%s"', (query) => {
    expect(classifyIntent(query)).toBe("matchup_analysis");
  });
});

// ─── general_advice ──────────────────────────────────────────────────────────

describe("classifyIntent → general_advice (fallback)", () => {
  it.each([
    "hello",
    "what is a salary cap",
    "how does H2H points work",
    "explain fantasy basketball rules",
    "who won the championship last year",
  ])('"%s"', (query) => {
    expect(classifyIntent(query)).toBe("general_advice");
  });
});

// ─── Priority ordering ────────────────────────────────────────────────────────

describe("classifyIntent priority — matchup_analysis beats lineup_optimization", () => {
  it("matchup query with 'stream' keyword → matchup_analysis, not lineup_optimization", () => {
    // This was the bug: Matchup Review quick-action prompt contains "stream to secure
    // the win" which was incorrectly routing to lineup_optimization → optimizer.
    expect(
      classifyIntent(
        "Provide a deep-dive review of my current matchup. Compare best/worst performers from both teams, track total games played vs. remaining, and suggest available healthy free agents to stream to secure the win."
      )
    ).toBe("matchup_analysis");
  });

  it("team audit prompt with 'streaming' keyword → NOT lineup_optimization", () => {
    // "potential streaming options" must not route to the optimizer graph
    const result = classifyIntent(
      "Perform a comprehensive audit of my team and roster. Give me a full overview including best and worst performers, a complete injury report, and potential streaming options. Also, include my current score, league standings, and matchup status."
    );
    expect(result).not.toBe("lineup_optimization");
  });
});

describe("classifyIntent priority — lineup_optimization beats player_research", () => {
  it("should treat 'should I drop Kawhi because he is injured' as lineup_optimization", () => {
    expect(classifyIntent("should I drop Kawhi because he is injured")).toBe("lineup_optimization");
  });

  it("should treat 'my roster overview and who to drop' as lineup_optimization", () => {
    expect(classifyIntent("my roster overview and who to drop")).toBe("lineup_optimization");
  });
});

describe("classifyIntent priority — free_agent_scan beats lineup_optimization for streaming queries", () => {
  it("'who should I stream tonight because Kawhi is out' → free_agent_scan", () => {
    // User is browsing waiver wire for a streaming pickup, not requesting full optimization
    expect(classifyIntent("who should I stream tonight because Kawhi is out")).toBe(
      "free_agent_scan"
    );
  });
});

// ─── Optimize Lineup quick action (must still reach the optimizer) ────────────

describe("classifyIntent — Optimize Lineup quick action routes correctly", () => {
  it("explicit optimize prompt routes to lineup_optimization", () => {
    expect(
      classifyIntent(
        "Optimize my lineup for this week. Find my best waiver wire streaming adds, identify my weakest drop candidates by schedule and average points, and simulate the top drop/add moves ranked by projected fantasy point gain."
      )
    ).toBe("lineup_optimization");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("classifyIntent edge cases", () => {
  it("handles empty string → general_advice", () => {
    expect(classifyIntent("")).toBe("general_advice");
  });

  it("handles whitespace-only string → general_advice", () => {
    expect(classifyIntent("   ")).toBe("general_advice");
  });

  it("is case-insensitive", () => {
    expect(classifyIntent("OPTIMIZE MY LINEUP")).toBe("lineup_optimization");
    expect(classifyIntent("IS JOKIC INJURED")).toBe("player_research");
  });

  it("handles greek text with english 'stream' keyword → free_agent_scan", () => {
    // Mixed Greek-English usage — "stream" triggers free_agent_scan
    expect(classifyIntent("βοήθα με να κάνω stream αυτή την εβδομάδα")).toBe("free_agent_scan");
  });
});
