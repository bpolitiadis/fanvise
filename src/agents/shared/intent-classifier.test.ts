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

  it("'my roster overview and who to drop' → team_audit (roster overview fires before lineup_optimization)", () => {
    // team_audit pattern contains 'roster overview' and is checked first in the priority list.
    // The ReAct agent handles this with get_my_roster + drop-score reasoning.
    expect(classifyIntent("my roster overview and who to drop")).toBe("team_audit");
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

// ─── team_audit: injury-audit + IR-slot queries ───────────────────────────────

describe("classifyIntent → team_audit (injury audit / IR slot queries)", () => {
  it("IR slot optimization query → team_audit, not lineup_optimization", () => {
    // "optimize my IR slots" was hitting lineup_optimization via "optim".
    // It is an injury-audit intent, not a waiver-move intent.
    expect(
      classifyIntent(
        "Check my team for any injured or Day-to-Day (DTD) players. Fetch the latest reports on their return timelines, injury progress, and status updates. Suggest how to optimize my IR slots and if any injured players are safe to drop or need immediate coverage."
      )
    ).toBe("team_audit");
  });

  it("'IR slot' alone → team_audit", () => {
    expect(classifyIntent("how should I manage my IR slot?")).toBe("team_audit");
  });

  it("'injured players on my team' → team_audit", () => {
    expect(classifyIntent("who are the injured players on my team")).toBe("team_audit");
  });

  it("'Give me a quick Monday game plan' → team_audit, not lineup_optimization", () => {
    expect(
      classifyIntent(
        "Give me a quick Monday game plan: who to start/sit, who to stream tonight, and the biggest injury watch item I should track before lock."
      )
    ).toBe("team_audit");
  });

  it("'return timeline' query containing 'injur' routes to ReAct agent (player_research), not optimizer", () => {
    // Contains "injur" → player_research fires before team_audit, but both go through the
    // ReAct agent — the critical thing is it does NOT hit lineup_optimization.
    const intent = classifyIntent("what are the return timelines for my injured players");
    expect(intent).not.toBe("lineup_optimization");
    expect(["team_audit", "player_research"]).toContain(intent);
  });

  it("'DTD players on my roster' routes to ReAct agent (player_research), not optimizer", () => {
    // "DTD" matches player_research; both player_research and team_audit go through
    // the same ReAct loop — neither hits the optimizer fast-path.
    const intent = classifyIntent("do I have any DTD players on my roster");
    expect(intent).not.toBe("lineup_optimization");
    expect(["team_audit", "player_research"]).toContain(intent);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

// ─── FM-1: Safety exclusion — rumor/drop queries must NOT hit lineup_optimization ──

describe("classifyIntent — safety exclusion (rumor + drop → player_research)", () => {
  it.each([
    "Breaking rumor on X says Giannis broke his leg and is out for the season. Should I drop him right now?",
    "My group chat says Jokic tore his ACL last night, should I drop him before waivers lock?",
    "A random account posted that Luka suffered a career-ending injury. Should I drop him now?",
    "Someone in my league chat says Nikola Jokic got hurt in practice. Should I drop him before the waiver deadline?",
    "Unverified social media says LeBron tore his knee. Should I drop him?",
  ])('"%s" → player_research, NOT lineup_optimization', (query) => {
    expect(classifyIntent(query)).toBe("player_research");
    expect(classifyIntent(query)).not.toBe("lineup_optimization");
  });

  it("'should I drop Kawhi for schedule reasons' (no rumor) → lineup_optimization", () => {
    // No rumor/safety keywords — legit optimization query
    expect(classifyIntent("should I drop Kawhi because he only has 1 game this week")).toBe(
      "lineup_optimization"
    );
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

describe("classifyIntent sport-scope exclusion", () => {
  it.each([
    "Who should I start in my NFL lineup this week?",
    "Give me my MLB waiver wire pickups",
    "Best soccer streamers this week",
  ])('"%s" → general_advice (out-of-scope sport)', (query) => {
    expect(classifyIntent(query)).toBe("general_advice");
  });

  it("NBA query should still route normally", () => {
    expect(classifyIntent("Who should I start in my NBA lineup this week?")).toBe(
      "lineup_optimization"
    );
  });
});

describe("classifyIntent hypothetical routing", () => {
  it("assumption-based lineup query routes to team_audit, not optimizer", () => {
    const intent = classifyIntent(
      "Assume all three of my DTD players are ruled out tonight. What is my best starting lineup?"
    );
    expect(intent).toBe("team_audit");
    expect(intent).not.toBe("lineup_optimization");
  });
});

describe("classifyIntent trade routing", () => {
  it("trade decision query routes to team_audit (not player_research)", () => {
    const intent = classifyIntent(
      "I can trade Naz Reid for Draymond Green. Should I accept?"
    );
    expect(intent).toBe("team_audit");
    expect(intent).not.toBe("player_research");
  });
});
