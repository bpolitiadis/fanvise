import { createClient } from "@supabase/supabase-js";
import { EspnClient } from "@/lib/espn/client";
import type { EspnRosterEntry, EspnTeam } from "@/lib/espn/types";
import { sleep } from "@/utils/retry";

interface PlayerCardInjuryDetails {
    expectedReturnDate?: number[];
    outForSeason?: boolean;
    type?: string;
}

interface PlayerCardPlayer {
    id?: number;
    fullName?: string;
    proTeamId?: number;
    injured?: boolean;
    injuryStatus?: string;
    injuryDetails?: PlayerCardInjuryDetails;
    lastNewsDate?: number;
    droppable?: boolean;
    starterStatusByProGame?: Record<string, string>;
    ownership?: Record<string, unknown>;
}

interface PlayerCardEntry {
    onTeamId?: number;
    lineupLocked?: boolean;
    tradeLocked?: boolean;
    player?: PlayerCardPlayer;
}

interface LeagueLikeResponse {
    scoringPeriodId?: number;
    teams?: EspnTeam[];
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const toIsoDate = (parts: number[] | undefined): string | null => {
    if (!Array.isArray(parts) || parts.length < 3) return null;
    const [year, month, day] = parts;
    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        year < 1900 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {
        return null;
    }
    const normalized = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : normalized;
};

const getRosterPlayerIds = (teams: EspnTeam[] | undefined): number[] => {
    if (!Array.isArray(teams)) return [];

    const ids = new Set<number>();
    for (const team of teams) {
        const roster = team.roster || team.rosterForCurrentScoringPeriod;
        const entries = roster?.entries || [];
        for (const entry of entries as EspnRosterEntry[]) {
            const rawId = entry.playerPoolEntry?.player?.id ?? entry.playerId;
            if (typeof rawId === "number" && Number.isFinite(rawId)) {
                ids.add(rawId);
            } else if (typeof rawId === "string") {
                const parsed = Number(rawId);
                if (Number.isFinite(parsed)) ids.add(parsed);
            }
        }
    }
    return Array.from(ids);
};

export async function fetchAndIngestPlayerStatusesFromLeague(limit = 80): Promise<number> {
    const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID;
    const seasonId = process.env.NEXT_PUBLIC_ESPN_SEASON_ID || new Date().getFullYear().toString();
    const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "fba";
    const swid = process.env.ESPN_SWID;
    const s2 = process.env.ESPN_S2;

    if (!leagueId) {
        console.warn("[Player Status] NEXT_PUBLIC_ESPN_LEAGUE_ID missing, skipping.");
        return 0;
    }

    const espnClient = new EspnClient(leagueId, seasonId, sport, swid, s2);
    const leagueData = await espnClient.getLeagueSettings() as LeagueLikeResponse;
    const scoringPeriodId = typeof leagueData.scoringPeriodId === "number" ? leagueData.scoringPeriodId : undefined;
    const rosterPlayerIds = getRosterPlayerIds(leagueData.teams);
    const maxPlayers = Math.max(1, Math.min(Math.floor(limit), 200));
    const targetPlayerIds = rosterPlayerIds.slice(0, maxPlayers);

    console.log(`[Player Status] Syncing ${targetPlayerIds.length} player cards from ESPN.`);

    let upserted = 0;
    for (const playerId of targetPlayerIds) {
        try {
            const payload = await espnClient.getPlayerCard(playerId, scoringPeriodId);
            const firstEntry = Array.isArray(payload?.players) ? (payload.players[0] as PlayerCardEntry | undefined) : undefined;
            const player = firstEntry?.player;

            if (!player || typeof player.id !== "number" || !player.fullName) {
                continue;
            }

            const expectedReturnDate = toIsoDate(player.injuryDetails?.expectedReturnDate);
            const lastNewsDateIso = typeof player.lastNewsDate === "number"
                ? new Date(player.lastNewsDate).toISOString()
                : null;

            const { error } = await supabase
                .from("player_status_snapshots")
                .upsert({
                    player_id: player.id,
                    player_name: player.fullName,
                    pro_team_id: typeof player.proTeamId === "number" ? player.proTeamId : null,
                    fantasy_team_id: typeof firstEntry?.onTeamId === "number" ? firstEntry.onTeamId : null,
                    injured: Boolean(player.injured),
                    injury_status: player.injuryStatus || null,
                    injury_type: player.injuryDetails?.type || null,
                    out_for_season: Boolean(player.injuryDetails?.outForSeason),
                    expected_return_date: expectedReturnDate,
                    last_news_date: lastNewsDateIso,
                    droppable: typeof player.droppable === "boolean" ? player.droppable : null,
                    lineup_locked: typeof firstEntry?.lineupLocked === "boolean" ? firstEntry.lineupLocked : null,
                    trade_locked: typeof firstEntry?.tradeLocked === "boolean" ? firstEntry.tradeLocked : null,
                    starter_status: player.starterStatusByProGame || {},
                    ownership: player.ownership || {},
                    source: "espn_kona_playercard",
                    last_synced_at: new Date().toISOString(),
                }, {
                    onConflict: "player_id",
                });

            if (!error) {
                upserted += 1;
            } else {
                console.error(`[Player Status] Failed upsert for ${player.fullName} (${player.id}):`, error.message);
            }
        } catch (error) {
            console.warn(`[Player Status] Failed player card fetch for ${playerId}:`, error);
        }

        await sleep(120);
    }

    console.log(`[Player Status] Sync complete. Upserted ${upserted} player snapshots.`);
    return upserted;
}
