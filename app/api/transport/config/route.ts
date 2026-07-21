import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import {
  normalizeTransportConfig,
  readTransportConfig,
  writeTransportConfig,
} from "@/lib/transport-config";

export const dynamic = "force-dynamic";

async function GET__secureImpl() {
  return NextResponse.json({ transport: readTransportConfig() });
}

async function PUT__secureImpl(req: Request) {
  try {
    const body = await req.json();
    const transport = normalizeTransportConfig(body);
    writeTransportConfig(transport);
    return NextResponse.json({ transport });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export const GET = withSecureRoute(GET__secureImpl);
export const PUT = withSecureRoute(PUT__secureImpl);
