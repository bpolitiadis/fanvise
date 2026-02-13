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
