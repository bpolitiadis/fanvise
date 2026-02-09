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

/** Team data structure for UI rendering */
export interface Team {
    id: string | number;
    name: string;
    abbrev: string;
    logo?: string;
    manager: string;
    is_user_owned?: boolean;
    wins?: number;
    losses?: number;
    ties?: number;
}
