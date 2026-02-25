import type { Team, Player } from './fantasy';
export type { Team, Player };

export interface NewsItem {
    id: string;
    url: string;
    title: string;
    summary?: string;
    content?: string;
    source: string;
    published_at: string;
    /** From intelligence extraction; used for sentiment dot styling */
    sentiment?: string | null;
    /** From intelligence extraction; injury news gets destructive styling */
    is_injury_report?: boolean | null;
    injury_status?: string | null;
}

export interface TransactionItem {
    id: string;
    type: string;
    description: string;
    published_at: string;
}

// Use centralized types to eliminate duplication
export type DashboardTeam = Team;
export type DashboardPlayer = Player;
