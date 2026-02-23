import { createClient } from "@/utils/supabase/server";

export interface PerspectiveInput {
    activeTeamId?: string | null;
    activeLeagueId?: string | null;
}

export type PerspectiveAuthorizationStatus =
    | "missing"
    | "authorized"
    | "authorized_public"
    | "unauthenticated"
    | "unauthorized";

export interface AuthorizedPerspective {
    activeTeamId?: string;
    activeLeagueId?: string;
    status: PerspectiveAuthorizationStatus;
}

const getDefaultLeagueId = (): string | null => {
    const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID?.trim();
    return leagueId ? leagueId : null;
};

const canUsePublicPerspectiveFallback = (): boolean => {
    const explicit = process.env.ALLOW_PUBLIC_PERSPECTIVE_FALLBACK?.trim().toLowerCase();
    if (explicit === "true") return true;
    if (explicit === "false") return false;

    // Safe default: allow in development where many local sessions are unauthenticated.
    return process.env.NODE_ENV !== "production";
};

const resolvePublicPerspective = async (
    activeTeamId: string,
    activeLeagueId?: string | null
): Promise<AuthorizedPerspective | null> => {
    const leagueId = activeLeagueId ?? getDefaultLeagueId();
    if (!leagueId) return null;

    const supabase = await createClient();
    const { data: leagueRecord, error } = await supabase
        .from("leagues")
        .select("league_id, teams")
        .eq("league_id", leagueId)
        .maybeSingle();

    if (error || !leagueRecord) {
        return null;
    }

    const teams = Array.isArray(leagueRecord.teams) ? leagueRecord.teams : [];
    const hasTeam = teams.some((team) => {
        if (!team || typeof team !== "object") return false;
        const candidate = team as { id?: unknown };
        return String(candidate.id ?? "") === String(activeTeamId);
    });

    if (!hasTeam) {
        return null;
    }

    return {
        activeTeamId: String(activeTeamId),
        activeLeagueId: String(leagueRecord.league_id),
        status: "authorized_public",
    };
};

const resolveDefaultPublicPerspective = async (
    activeLeagueId?: string | null
): Promise<AuthorizedPerspective | null> => {
    const leagueId = activeLeagueId ?? getDefaultLeagueId();
    if (!leagueId) return null;

    const supabase = await createClient();
    const { data: leagueRecord, error } = await supabase
        .from("leagues")
        .select("league_id, teams")
        .eq("league_id", leagueId)
        .maybeSingle();

    if (error || !leagueRecord) {
        return null;
    }

    const teams = Array.isArray(leagueRecord.teams) ? leagueRecord.teams : [];
    const preferredTeam = teams.find((team) => {
        if (!team || typeof team !== "object") return false;
        const candidate = team as { is_user_owned?: unknown };
        return Boolean(candidate.is_user_owned);
    }) ?? teams[0];

    if (!preferredTeam || typeof preferredTeam !== "object") {
        return null;
    }

    const candidate = preferredTeam as { id?: unknown };
    const teamId = candidate.id ? String(candidate.id) : "";
    if (!teamId) return null;

    return {
        activeTeamId: teamId,
        activeLeagueId: String(leagueRecord.league_id),
        status: "authorized_public",
    };
};

/**
 * For authenticated users with no requested team, resolve their actual team
 * from user_leagues or user_settings. Never use env/default for authed users.
 */
const resolveAuthenticatedUserPerspective = async (
    userId: string
): Promise<AuthorizedPerspective | null> => {
    const supabase = await createClient();

    // 1. user_leagues (authoritative) — prefer is_active, else first membership
    const { data: membership } = await supabase
        .from("user_leagues")
        .select("league_id, team_id, is_active")
        .eq("user_id", userId)
        .order("is_active", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (membership?.team_id && membership?.league_id) {
        return {
            activeTeamId: String(membership.team_id),
            activeLeagueId: String(membership.league_id),
            status: "authorized",
        };
    }

    // 2. user_settings — espn_team_id / espn_league_id (saved in Settings)
    const { data: settings } = await supabase
        .from("user_settings")
        .select("espn_team_id, espn_league_id")
        .eq("user_id", userId)
        .maybeSingle();

    const settingsTeamId = settings?.espn_team_id?.trim() || null;
    const settingsLeagueId = settings?.espn_league_id?.trim() || null;

    if (settingsTeamId && settingsLeagueId) {
        // Verify team exists in league
        const { data: leagueRecord } = await supabase
            .from("leagues")
            .select("league_id, teams")
            .eq("league_id", settingsLeagueId)
            .maybeSingle();

        const teams = Array.isArray(leagueRecord?.teams) ? leagueRecord.teams : [];
        const hasTeam = teams.some((t) =>
            t && typeof t === "object" && String((t as { id?: unknown }).id ?? "") === String(settingsTeamId)
        );

        if (hasTeam) {
            return {
                activeTeamId: settingsTeamId,
                activeLeagueId: settingsLeagueId,
                status: "authorized",
            };
        }
    }

    return null;
};

/**
 * Validates whether the requested perspective belongs to the authenticated user.
 * Falls back to generic context when the user is not authorized.
 */
export async function authorizePerspectiveScope(
    input: PerspectiveInput
): Promise<AuthorizedPerspective> {
    const { activeTeamId, activeLeagueId } = input;
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    const requestedTeamId = activeTeamId ? String(activeTeamId) : undefined;

    if (!requestedTeamId) {
        // Authenticated users: always prefer their actual team from user_leagues or user_settings.
        // Never use env/default fallback — that returns wrong teams (e.g. Salonica Eagles).
        if (userId) {
            const userPerspective = await resolveAuthenticatedUserPerspective(userId);
            if (userPerspective) {
                return userPerspective;
            }
        }

        // Unauthenticated or no saved team: use default only when allowed (dev mode)
        if (canUsePublicPerspectiveFallback()) {
            const defaultPublicPerspective = await resolveDefaultPublicPerspective(activeLeagueId);
            if (defaultPublicPerspective) {
                return defaultPublicPerspective;
            }
        }

        return {
            activeTeamId: undefined,
            activeLeagueId: undefined,
            status: "missing",
        };
    }

    if (!userId) {
        if (canUsePublicPerspectiveFallback()) {
            const publicPerspective = await resolvePublicPerspective(requestedTeamId, activeLeagueId);
            if (publicPerspective) {
                return publicPerspective;
            }
        }

        return {
            activeTeamId: undefined,
            activeLeagueId: undefined,
            status: "unauthenticated",
        };
    }

    const { data: membership, error } = await supabase
        .from("user_leagues")
        .select("league_id, team_id, is_active")
        .eq("user_id", userId)
        .eq("team_id", requestedTeamId)
        .order("is_active", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!error && membership) {
        const resolvedLeagueId = membership.league_id;
        // Enforce league consistency when the client sends one.
        if (activeLeagueId && activeLeagueId !== resolvedLeagueId) {
            return { activeTeamId: undefined, activeLeagueId: undefined, status: "unauthorized" };
        }
        return {
            activeTeamId: String(membership.team_id),
            activeLeagueId: String(resolvedLeagueId),
            status: "authorized",
        };
    }

    // No user_leagues entry — check whether the user has saved this team in user_settings.
    // This covers new users and the dev flow where user_leagues is not populated.
    const { data: userSettings } = await supabase
        .from("user_settings")
        .select("espn_team_id, espn_league_id")
        .eq("user_id", userId)
        .maybeSingle();

    const settingsTeamId = userSettings?.espn_team_id?.trim() || null;
    const settingsLeagueId = userSettings?.espn_league_id?.trim() || null;

    // Also accept the env-var default team (dev convenience).
    const envTeamId = process.env.NEXT_PUBLIC_ESPN_TEAM_ID?.trim() || null;
    const isOwnTeam =
        (settingsTeamId && String(settingsTeamId) === String(requestedTeamId)) ||
        (envTeamId && String(envTeamId) === String(requestedTeamId));

    if (isOwnTeam) {
        const resolvedLeagueId =
            settingsLeagueId ??
            activeLeagueId ??
            getDefaultLeagueId();
        if (resolvedLeagueId) {
            return {
                activeTeamId: String(requestedTeamId),
                activeLeagueId: String(resolvedLeagueId),
                status: "authorized",
            };
        }
    }

    // For any other team in the same league (perspective switching to opponent view),
    // allow it in dev/public-fallback mode so users can analyse any team.
    if (canUsePublicPerspectiveFallback()) {
        const publicPerspective = await resolvePublicPerspective(requestedTeamId, activeLeagueId);
        if (publicPerspective) return publicPerspective;
    }

    return { activeTeamId: undefined, activeLeagueId: undefined, status: "unauthorized" };
}
