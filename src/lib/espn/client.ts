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
        // mTeam is required for full team name fields (location + nickname).
        // mRoster provides player data for name resolution of rostered players.
        // mTransactions2 provides the transaction list.
        const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${this.sport}/seasons/${this.year}/segments/0/leagues/${this.leagueId}?view=mTransactions2&view=mTeam&view=mRoster`;

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

    /**
     * Fetches top player performances for a single scoring period.
     *
     * ESPN does not expose a stable public "leaders" endpoint contract, so this
     * uses `kona_player_info` with sorting/filtering tuned for per-period totals.
     */
    async getLeadersForScoringPeriod(scoringPeriodId: number, limit: number = 200) {
        const periodId = Math.max(1, Math.floor(scoringPeriodId));
        const cappedLimit = Math.max(1, Math.min(Math.floor(limit), 500));
        const url = this.buildLeagueUrl(["kona_player_info"], { scoringPeriodId: periodId });

        console.log(`Fetching Daily Leaders (scoringPeriodId=${periodId}): ${url}`);

        const headers = this.getHeaders() as Record<string, string>;
        headers["x-fantasy-platform"] = "espn-fantasy-web";
        headers["x-fantasy-source"] = "kona";

        const response = await fetch(url, {
            headers,
            next: { revalidate: 300 },
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            console.error(`ESPN Leaders Error (${response.status}) for scoringPeriodId=${periodId}:`, text.substring(0, 500));
            throw new Error(`ESPN Leaders Error: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        try {
            const parsed = JSON.parse(text);
            const players = Array.isArray(parsed?.players) ? parsed.players : [];
            const toNumber = (value: unknown): number => {
                if (typeof value === "number" && Number.isFinite(value)) return value;
                if (typeof value === "string" && value.trim()) {
                    const parsedValue = Number(value);
                    return Number.isFinite(parsedValue) ? parsedValue : Number.NEGATIVE_INFINITY;
                }
                return Number.NEGATIVE_INFINITY;
            };

            return players
                .sort((a: unknown, b: unknown) => {
                    const aTotal = toNumber((a as Record<string, unknown>)?.appliedStatTotal);
                    const bTotal = toNumber((b as Record<string, unknown>)?.appliedStatTotal);
                    return bTotal - aTotal;
                })
                .slice(0, cappedLimit);
        } catch {
            console.error(`Failed to parse ESPN leaders response for scoringPeriodId=${periodId}:`, text.substring(0, 500));
            throw new Error(`Invalid JSON from ESPN leaders: ${text.substring(0, 200)}...`);
        }
    }

    /**
     * Fetches the ESPN player card payload for a single player.
     * This endpoint includes canonical injury metadata used by fantasy UI.
     */
    async getPlayerCard(playerId: number, scoringPeriodId?: number) {
        const params: Record<string, string | number> = {};
        if (typeof scoringPeriodId === 'number' && Number.isFinite(scoringPeriodId)) {
            params.scoringPeriodId = Math.floor(scoringPeriodId);
        }

        const url = this.buildLeagueUrl(["kona_playercard"], params);
        const headers = this.getHeaders() as Record<string, string>;
        headers["x-fantasy-filter"] = JSON.stringify({
            players: {
                filterIds: { value: [playerId] },
            },
        });
        headers["x-fantasy-platform"] = "espn-fantasy-web";
        headers["x-fantasy-source"] = "kona";

        console.log(`Fetching Player Card (${playerId}): ${url}`);

        const response = await fetch(url, {
            headers,
            next: { revalidate: 60 },
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            console.error(`ESPN Player Card Error (${response.status}) for ${playerId}:`, text.substring(0, 500));
            throw new Error(`ESPN Player Card Error: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            console.error(`Failed to parse ESPN player card response for ${playerId}:`, text.substring(0, 500));
            throw new Error(`Invalid JSON from ESPN player card: ${text.substring(0, 200)}...`);
        }
    }

    /**
     * Fetches per-scoring-period actual stats for one or more players.
     *
     * Uses kona_playercard which returns the full player profile including
     * a `player.stats` array. We keep only entries where:
     *   statSourceId === 0  → actual (not projected)
     *   statSplitTypeId === 1 → per scoring period (not season totals)
     *
     * Each scoring period in NBA fantasy corresponds to a single game day,
     * so the result is effectively a game log.
     *
     * @param playerIds  ESPN player IDs to fetch
     * @param lastNPeriods  How many most-recent scoring periods to return (default 10)
     */
    async getPlayerGameLog(playerIds: number[], lastNPeriods: number = 10) {
        if (!playerIds.length) return [];

        const url = this.buildLeagueUrl(["kona_playercard"]);
        const headers = this.getHeaders() as Record<string, string>;
        headers["x-fantasy-filter"] = JSON.stringify({
            players: {
                filterIds: { value: playerIds },
            },
        });
        headers["x-fantasy-platform"] = "espn-fantasy-web";
        headers["x-fantasy-source"] = "kona";

        console.log(`Fetching Player Game Log for IDs [${playerIds.join(", ")}]: ${url}`);

        const response = await fetch(url, {
            headers,
            next: { revalidate: 60 },
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            console.error(
                `ESPN Player Game Log Error (${response.status}) for [${playerIds.join(", ")}]:`,
                text.substring(0, 500)
            );
            throw new Error(`ESPN Player Game Log Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const players: unknown[] = Array.isArray(data?.players) ? data.players : [];

        return players.map((entry) => {
            const e = entry as Record<string, unknown>;
            const player = (e.player ?? {}) as Record<string, unknown>;
            const rawStats: unknown[] = Array.isArray(player.stats) ? player.stats : [];

            // Filter to actual per-period entries only, then take the N most recent
            const periodStats = rawStats
                .filter((s): s is Record<string, unknown> => {
                    const stat = s as Record<string, unknown>;
                    return (
                        typeof s === "object" &&
                        s !== null &&
                        stat.statSourceId === 0 &&
                        stat.statSplitTypeId === 1
                    );
                })
                .sort((a, b) => {
                    const aPeriod = typeof a.scoringPeriodId === "number" ? a.scoringPeriodId : 0;
                    const bPeriod = typeof b.scoringPeriodId === "number" ? b.scoringPeriodId : 0;
                    return bPeriod - aPeriod; // most recent first
                })
                .slice(0, lastNPeriods);

            return {
                playerId: typeof e.id === "number" ? e.id : null,
                playerName: (player.fullName as string) || null,
                proTeamId: typeof player.proTeamId === "number" ? player.proTeamId : null,
                stats: periodStats.map((s) => ({
                    scoringPeriodId: s.scoringPeriodId as number,
                    appliedTotal: typeof s.appliedTotal === "number" ? s.appliedTotal : 0,
                    stats: (s.stats ?? {}) as Record<string, number>,
                })),
            };
        });
    }

    /**
     * Batch fetch player info for a list of player IDs.
     * Useful for resolving names when they are missing from roster views (e.g. dropped players).
     *
     * Per the ESPN API reference, ID-based lookups must use ONLY filterIds.
     * Adding filterStatus causes ESPN to apply both conditions simultaneously and silently
     * drops players whose current status falls outside the allowed set — this is exactly
     * what happens to players that were recently dropped and are in a transient state.
     */
    async getPlayerInfo(playerIds: number[]) {
        if (!playerIds.length) return [];

        const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${this.sport}/seasons/${this.year}/segments/0/leagues/${this.leagueId}?view=kona_player_info`;

        const uniqueIds = Array.from(new Set(playerIds));
        console.log(`Fetching Player Info for ${uniqueIds.length} players: [${uniqueIds.join(", ")}]`);

        const headers = this.getHeaders() as Record<string, string>;
        // filterIds only — no filterStatus, which would silently exclude transient-status players
        headers["x-fantasy-filter"] = JSON.stringify({
            players: {
                filterIds: { value: uniqueIds },
            },
        });

        try {
            const response = await fetch(url, {
                headers,
                // Short TTL: recently dropped players change status quickly; a stale
                // empty response cached for hours would leave names permanently unresolved.
                next: { revalidate: 60 },
            });

            if (!response.ok) {
                throw new Error(`ESPN API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const players = data.players || [];
            console.log(`Player Info resolved ${players.length} / ${uniqueIds.length} players`);
            return players;
        } catch (error) {
            console.error("Failed to fetch player info batch:", error);
            return [];
        }
    }
}
