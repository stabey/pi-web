import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { discoverProviderModels, readCachedProviderModels, writeCachedProviderModels } from "@/lib/model-discovery";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function POST__secureImpl(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json() as { providerName?: unknown; provider?: unknown; cacheOnly?: unknown };
    const providerName = typeof body.providerName === "string" ? body.providerName.trim() : "";
    if (!providerName) return NextResponse.json({ error: "providerName is required" }, { status: 400 });
    if (!isRecord(body.provider)) return NextResponse.json({ error: "provider is required" }, { status: 400 });

    if (body.cacheOnly === true) {
      const cached = readCachedProviderModels(providerName, body.provider);
      return NextResponse.json(cached ? { ...cached, cached: true } : { cached: false });
    }

    const discovered = await discoverProviderModels(providerName, body.provider);
    return NextResponse.json(writeCachedProviderModels(providerName, body.provider, discovered));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export const POST = withSecureRoute(POST__secureImpl);
