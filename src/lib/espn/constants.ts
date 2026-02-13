export const ESPN_STAT_MAPPINGS: Record<number, string> = {
    0: 'Points (PTS)',
    1: 'Blocks (BLK)',
    2: 'Steals (STL)',
    3: 'Assists (AST)',
    4: 'Offensive Rebounds (OREB)',
    5: 'Defensive Rebounds (DREB)',
    6: 'Rebounds (REB)',
    7: 'Ejections (EJ)',
    8: 'Flagrant Fouls (FF)',
    9: 'Personal Fouls (PF)',
    10: 'Technical Fouls (TF)',
    11: 'Turnovers (TO)',
    12: 'Disqualifications (DQ)',
    13: 'Field Goals Made (FGM)',
    14: 'Field Goals Attempted (FGA)',
    15: 'Free Throws Made (FTM)',
    16: 'Free Throws Attempted (FTA)',
    17: '3-Pointers Made (3PM)',
    18: '3-Pointers Attempted (3PA)',
    19: 'Field Goal % (FG%)',
    20: 'Free Throw % (FT%)',
    21: '3-Point % (3PT%)',
    22: 'Adjusted FG % (AFG%)',
    37: 'Double-Doubles (DD)',
    38: 'Triple-Doubles (TD)',
    39: 'Quadruple-Doubles (QD)',
    40: 'Minutes (MIN)',
    41: 'Games Started (GS)',
    42: 'Games Played (GP)',
    43: 'Total Wins (TW)',
    44: 'Free Throw Rate (FTR)',
};

export const ESPN_POSITION_MAPPINGS: Record<number, string> = {
    0: 'PG',
    1: 'SG',
    2: 'SF',
    3: 'PF',
    4: 'C',
    5: 'G',
    6: 'F',
    7: 'SG/SF',
    8: 'G/F',
    9: 'PF/C',
    10: 'F/C',
    11: 'UTIL',
    12: 'BENCH',
    13: 'IR',
    14: 'HOT', // Head Coach? Unclear from map but keeping slot
    15: 'Rookie'
};

export const ESPN_PRO_TEAM_MAP: Record<number, string> = {
    0: 'FA',
    1: 'ATL',
    2: 'BOS',
    3: 'NOP',
    4: 'CHI',
    5: 'CLE',
    6: 'DAL',
    7: 'DEN',
    8: 'DET',
    9: 'GSW',
    10: 'HOU',
    11: 'IND',
    12: 'LAC',
    13: 'LAL',
    14: 'MIA',
    15: 'MIL',
    16: 'MIN',
    17: 'BKN',
    18: 'NYK',
    19: 'ORL',
    20: 'PHL',
    21: 'PHO',
    22: 'POR',
    23: 'SAC',
    24: 'SAS',
    25: 'OKC',
    26: 'UTA',
    27: 'WAS',
    28: 'TOR',
    29: 'MEM',
    30: 'CHA',
};

export function getPositionName(id: number | string): string {
    const numericId = typeof id === 'string' ? parseInt(id) : id;
    return ESPN_POSITION_MAPPINGS[numericId] || String(id);
}

export function getStatName(id: number): string {
    const name = ESPN_STAT_MAPPINGS[id];
    if (!name) return `Stat ID: ${id}`;

    return name;
}
