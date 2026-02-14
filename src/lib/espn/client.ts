export class EspnClient {
    private leagueId: string;
    private year: string;
    private sport: string;
    private swid?: string;
    private s2?: string;

    constructor(leagueId: string, year: string, sport: string = "ffl", swid?: string, s2?: string) {
        this.leagueId = leagueId;
        this.year = year;
        this.sport = sport;
        this.swid = swid;
        this.s2 = s2;
    }

    // Helper to construct headers with cookies
    private getHeaders(): HeadersInit {
        const headers: Record<string, string> = {
            "User-Agent": "FanVise/1.0",
        };

        if (this.swid && this.s2) {
            headers["Cookie"] = `swid=${this.swid}; espn_s2=${this.s2};`;
        }

        return headers;
    }

    private buildLeagueUrl(views: string[], params?: Record<string, string | number>) {
        const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${this.sport}/seasons/${this.year}/segments/0/leagues/${this.leagueId}`;
        const query = new URLSearchParams();

        for (const view of views) {
            query.append("view", view);
        }

        if (params) {
            for (const [key, value] of Object.entries(params)) {
                query.append(key, String(value));
            }
        }

        return `${base}?${query.toString()}`;
    }

    private async fetchLeagueViews(
        views: string[],
        options?: {
            revalidate?: number;
            params?: Record<string, string | number>;
        }
    ) {
        const url = this.buildLeagueUrl(views, options?.params);
        console.log(`Fetching ESPN views [${views.join(", ")}]: ${url}`);

        const response = await fetch(url, {
            headers: this.getHeaders(),
            next: { revalidate: options?.revalidate ?? 300 },
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            console.error(`ESPN API Error (${response.status}) for [${views.join(", ")}]:`, text.substring(0, 500));
            throw new Error(`ESPN API Error: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            console.error(`Failed to parse ESPN response for [${views.join(", ")}]:`, text.substring(0, 500));
            throw new Error(`Invalid JSON from ESPN: ${text.substring(0, 200)}...`);
        }
    }

    async getLeagueSettings() {
        // ESPN can return incomplete payloads when too many views are combined.
        // Fetch core league data first, then merge optional intelligence views.
        try {
            const coreData = await this.fetchLeagueViews(["mSettings", "mTeam", "mRoster"], {
                revalidate: 3600,
            });

            const [draftResult, positionalResult, liveScoringResult] = await Promise.allSettled([
                this.fetchLeagueViews(["mDraftDetail"], { revalidate: 3600 }),
                this.fetchLeagueViews(["mPositionalRatings"], { revalidate: 3600 }),
                this.fetchLeagueViews(["mLiveScoring"], { revalidate: 600 }),
            ]);

            const mergedData = {
                ...coreData,
                draftDetail:
                    draftResult.status === "fulfilled"
                        ? (draftResult.value?.draftDetail ?? coreData?.draftDetail)
                        : coreData?.draftDetail,
                positionalRatings:
                    positionalResult.status === "fulfilled"
                        ? (positionalResult.value?.positionalRatings ?? coreData?.positionalRatings)
                        : coreData?.positionalRatings,
                liveScoring:
                    liveScoringResult.status === "fulfilled"
                        ? (liveScoringResult.value?.liveScoring ?? coreData?.liveScoring)
                        : coreData?.liveScoring,
            };

            if (draftResult.status === "rejected") {
                console.warn("mDraftDetail fetch failed; continuing with core payload.");
            }
            if (positionalResult.status === "rejected") {
                console.warn("mPositionalRatings fetch failed; continuing with core payload.");
            }
            if (liveScoringResult.status === "rejected") {
                console.warn("mLiveScoring fetch failed; continuing with core payload.");
            }

            return mergedData;
        } catch (error) {
            console.error("Failed to fetch league settings:", error);
            throw error;
        }
    }

    async getMatchups(scoringPeriodId?: number, views: string[] = ["mMatchup"]) {
        // If no scoring period is provided, fetch for the current week (assumed logic elsewhere or default view)
        const viewParams = views.map(v => `view=${v}`).join('&');
        let url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${this.sport}/seasons/${this.year}/segments/0/leagues/${this.leagueId}?${viewParams}`;

        if (scoringPeriodId) {
            url += `&scoringPeriodId=${scoringPeriodId}`;
        }

        console.log(`Fetching Matchups: ${url}`);

        try {
            const response = await fetch(url, {
                headers: this.getHeaders(),
                next: { revalidate: 60 } // Cache for 1 minute
            });

            if (!response.ok) {
                throw new Error(`ESPN API Error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to fetch matchups:", error);
            throw error;
        }
    }

    async getTransactions() {
        // Fetch transactions and roster to allow player name resolution
        const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${this.sport}/seasons/${this.year}/segments/0/leagues/${this.leagueId}?view=mTransactions2&view=mRoster`;

        console.log(`Fetching Transactions: ${url}`);

        try {
            const response = await fetch(url, {
                headers: this.getHeaders(),
                next: { revalidate: 0 } // Do not cache transactions to ensure freshness
            });

            if (!response.ok) {
                throw new Error(`ESPN API Error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to fetch transactions:", error);
            throw error;
        }
    }

    /**
     * Fetches the professional team schedules (NBA schedule).
     * This is a season-level endpoint, not specific to the league instance.
     */
    async getProTeamSchedules() {
        const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${this.sport}/seasons/${this.year}?view=proTeamSchedules_wl`;

        console.log(`Fetching Pro Schedule: ${url}`);

        try {
            const response = await fetch(url, {
                headers: this.getHeaders(),
                next: { revalidate: 86400 } // Cache for 24 hours (schedule rarely changes)
            });

            if (!response.ok) {
                throw new Error(`ESPN API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            // The data comes back in a structure similar to league settings but at season level
            // We are interested in data.settings.proTeams
            return data;
        } catch (error) {
            console.error("Failed to fetch pro schedule:", error);
            throw error;
        }
    }

    /**
     * Fetches top free agents (waiver wire) for the league.
     * Use filters to narrow down by position or status.
     */
    async getFreeAgents(limit: number = 50, positionId?: number) {
        // kona_player_info is the view for searching/filtering players
        const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${this.sport}/seasons/${this.year}/segments/0/leagues/${this.leagueId}?view=kona_player_info`;

        console.log(`Fetching Free Agents: ${url}`);

        // Construct filters similar to espn-api python lib
        const filterStatus = { "value": ["FREEAGENT", "WAIVERS"] };
        const filterSlotIds = positionId ? { "value": [positionId] } : undefined;

        const filters = {
            "players": {
                "filterStatus": filterStatus,
                "filterSlotIds": filterSlotIds,
                "limit": limit,
                "sortPercOwned": { "sortPriority": 1, "sortAsc": false },
                "sortDraftRanks": { "sortPriority": 100, "sortAsc": true, "value": "STANDARD" }
            }
        };

        const headers = this.getHeaders() as Record<string, string>;
        headers['x-fantasy-filter'] = JSON.stringify(filters);

        try {
            const response = await fetch(url, {
                headers: headers,
                next: { revalidate: 300 } // Cache for 5 minutes
            });

            if (!response.ok) {
                throw new Error(`ESPN API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data.players || [];
        } catch (error) {
            console.error("Failed to fetch free agents:", error);
            throw error;
        }
    }
}
