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

/**
 * Validates whether the requested perspective belongs to the authenticated user.
 * Falls back to generic context when the user is not authorized.
 */
export async function authorizePerspectiveScope(
    input: PerspectiveInput
): Promise<AuthorizedPerspective> {
    const { activeTeamId, activeLeagueId } = input;
    if (!activeTeamId) {
        return {
            activeTeamId: undefined,
            activeLeagueId: undefined,
            status: "missing",
        };
    }

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;

    if (!userId) {
        if (canUsePublicPerspectiveFallback()) {
            const publicPerspective = await resolvePublicPerspective(activeTeamId, activeLeagueId);
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
        .eq("team_id", activeTeamId)
        .order("is_active", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !membership) {
        return {
            activeTeamId: undefined,
            activeLeagueId: undefined,
            status: "unauthorized",
        };
    }

    const resolvedLeagueId = membership.league_id;

    // If the client sends a league ID, enforce that it matches server-side membership.
    if (activeLeagueId && activeLeagueId !== resolvedLeagueId) {
        return {
            activeTeamId: undefined,
            activeLeagueId: undefined,
            status: "unauthorized",
        };
    }

    return {
        activeTeamId: String(membership.team_id),
        activeLeagueId: String(resolvedLeagueId),
        status: "authorized",
    };
}
