export const ESPN_STAT_MAPPINGS: Record<number, string> = {
    0: "Points (PTS)",
    1: "Blocks (BLK)",
    2: "Steals (STL)",
    3: "Assists (AST)",
    4: "Offensive Rebounds (OREB)",
    6: "Rebounds (REB)",
    11: "Turnovers (TO)",
    13: "Field Goals Made (FGM)",
    14: "Field Goals Attempted (FGA)",
    15: "Free Throws Made (FTM)",
    16: "Free Throws Attempted (FTA)",
    17: "3-Pointers Made (3PM)",
    19: "3-Pointers Attempted (3PA)",
    37: "Offensive Rebounds (OREB)", // Creating duplicate just in case, but 4 is the primary based on validation
    38: "Triple-Doubles (TD)",
    39: "Quadruple-Doubles (QD)",
    40: "Quadruple-Doubles (QD)" // Keeping as fallback
};

export const ESPN_POSITION_MAPPINGS: Record<number, string> = {
    1: 'PG',
    2: 'SG',
    3: 'SF',
    4: 'PF',
    5: 'C',
    11: 'G',
    12: 'F',
    13: 'G/F', // Swingman
    15: 'UTIL'
};

export function getPositionName(id: number | string): string {
    const numericId = typeof id === 'string' ? parseInt(id) : id;
    return ESPN_POSITION_MAPPINGS[numericId] || String(id);
}

// Specialized mapping for penalties if needed based on points sign
// Stat 14 (FGA) with negative points often implies Missed FG penalty logic in UI
// Stat 16 (FTA) with negative points often implies Missed FT penalty

export function getStatName(id: number, points: number): string {
    const name = ESPN_STAT_MAPPINGS[id];
    if (!name) return `Stat ID: ${id}`;

    return name;
}
