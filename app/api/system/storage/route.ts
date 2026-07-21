import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { collectStorageUsage } from "@/lib/storage-usage";

export const dynamic = "force-dynamic";

async function GET__secureImpl(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json(collectStorageUsage());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export const GET = withSecureRoute(GET__secureImpl);
