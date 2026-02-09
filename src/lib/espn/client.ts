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
        const headers: HeadersInit = {
            "User-Agent": "FanVise/1.0",
        };

        if (this.swid && this.s2) {
            headers["Cookie"] = `swid=${this.swid}; espn_s2=${this.s2};`;
        }

        return headers;
    }

    async getLeagueSettings() {
        // Use lm-api-reads for better reliability with some legacy/private leagues
        const params = new URLSearchParams({
            view: "mSettings"
        });
        // Add multiple views by appending manually since URLSearchParams encodes commas sometimes in a way ESPN doesn't like,
        // or just use the standard parameter repetition if supported.
        // ESPN V3 compliant way: ?view=mSettings&view=mTeam&view=mRoaster
        const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${this.sport}/seasons/${this.year}/segments/0/leagues/${this.leagueId}?view=mSettings&view=mTeam&view=mRoster&view=mBoxScore&view=mDraftDetail&view=mPositionalRatings&view=mPendingTransactions&view=mLiveScoring`;

        console.log(`Fetching League Settings: ${url}`);

        try {
            const response = await fetch(url, {
                headers: this.getHeaders(),
                next: { revalidate: 3600 } // Cache for 1 hour
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`ESPN API Error (${response.status}):`, text.substring(0, 500)); // Log first 500 chars
                throw new Error(`ESPN API Error: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                console.error("Failed to parse ESPN response:", text.substring(0, 500));
                throw new Error(`Invalid JSON from ESPN: ${text.substring(0, 200)}...`);
            }
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
}
