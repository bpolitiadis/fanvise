import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set(["mystique-api.fantasy.espn.com"]);

export async function GET(request: NextRequest) {
    const src = request.nextUrl.searchParams.get("src");
    if (!src) {
        return NextResponse.json({ error: "Missing src parameter" }, { status: 400 });
    }

    let parsed: URL;
    try {
        parsed = new URL(src);
    } catch {
        return NextResponse.json({ error: "Invalid src URL" }, { status: 400 });
    }

    if (!["https:", "http:"].includes(parsed.protocol)) {
        return NextResponse.json({ error: "Unsupported URL protocol" }, { status: 400 });
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
        return NextResponse.json({ error: "Host is not allowed" }, { status: 403 });
    }

    const swid = process.env.ESPN_SWID;
    const s2 = process.env.ESPN_S2;
    if (!swid || !s2) {
        return NextResponse.json({ error: "ESPN credentials are not configured" }, { status: 500 });
    }

    const response = await fetch(parsed.toString(), {
        headers: {
            "User-Agent": "FanVise/1.0",
            Cookie: `swid=${swid}; espn_s2=${s2};`,
        },
        next: { revalidate: 3600 },
    });

    if (!response.ok) {
        return NextResponse.json(
            { error: `Failed to fetch upstream logo (${response.status})` },
            { status: 502 }
        );
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/png";

    return new NextResponse(imageBuffer, {
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
    });
}
