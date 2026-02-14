const ESPN_PROTECTED_LOGO_HOSTS = new Set([
    "mystique-api.fantasy.espn.com",
]);

export const getNormalizedTeamLogoUrl = (logoUrl?: string): string | undefined => {
    if (!logoUrl || typeof logoUrl !== "string") return undefined;

    try {
        const parsed = new URL(logoUrl);
        if (ESPN_PROTECTED_LOGO_HOSTS.has(parsed.hostname)) {
            return `/api/espn/team-logo?src=${encodeURIComponent(logoUrl)}`;
        }
        return logoUrl;
    } catch {
        return undefined;
    }
};
