# Data Audit & Roadmap: Lineup Management

## Executive Summary
This document analyzes the current data capabilities of FanVise versus the requirements for the proposed "Lineup Management" (Start/Sit) feature. 

**Conclusion**: We currently lack two critical data points:
1.  **NBA Schedule**: Which actual NBA teams play on which dates?
2.  **Daily Roster Slots**: How many players can start at each position on a given day?

## 1. Missing Data Points

### A. The NBA Schedule Problem
To recommend "Who to start on Tuesday?", we need to know who is playing on Tuesday.
- **Current State**: We fetch player stats and injury status, but we do not know their upcoming game schedule.
- **Requirement**: A source of truth for the NBA schedule (e.g., "LAL vs GSW @ 7:00 PM EST on 2024-10-24").

### B. The Daily Roster Slot Problem
Fantasy leagues update daily. A player might be a "Point Guard" (PG) but on Tuesday we might only have 1 PG slot available, while on Wednesday we have 2.
- **Current State**: We fetch `rosterSettings` which gives us the *general* slot counts (e.g., 1 PG, 1 SG), but we don't track the *daily* usage of these slots in our database.
- **Requirement**: Logic to determine "Is the PG slot open for this specific date?"

## 2. Proposed Architecture: ScheduleService

We need a dedicated service to handle time-based data.

### 2.1. New Database Table: `nba_schedule`
We should ingest the NBA schedule once per season (or weekly).

```sql
CREATE TABLE nba_schedule (
    game_id TEXT PRIMARY KEY,
    date DATE NOT NULL,
    home_team_id TEXT NOT NULL,
    away_team_id TEXT NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE
);
```

### 2.2. New Service: `ScheduleService`
A TypeScript service class responsible for:
1.  **Ingestion**: Fetching the full NBA schedule (from ESPN or another source) and storing it.
2.  **Querying**: `getGamesForDate(date: Date): Game[]`
3.  **Player Mapping**: `getGamesForPlayer(playerId: string, startDate: Date, endDate: Date): Game[]` (Requires mapping Player -> Pro Team).

### 2.3. Lineup Optimizer Logic
With the schedule data, we can build the optimizer:

```typescript
function recommendLineup(roster: Player[], date: Date) {
    // 1. Get all players with a game today
    const activePlayers = roster.filter(p => scheduleService.hasGame(p.proTeamId, date));
    
    // 2. Sort by projected points
    const rankedPlayers = activePlayers.sort((a, b) => b.projectedPoints - a.projectedPoints);
    
    // 3. Fill slots
    // ... logic to fill PG, SG, G, UTIL slots optimally
}
```

## 3. Next Steps
1.  **Approve Schema**: Confirm we want to add the `nba_schedule` table.
2.  **Select Data Source**: Currently we use ESPN's undocumented API. We can likely find a `schedule` endpoint there too.
3.  **Implement Service**: Build `src/services/schedule.service.ts`.
