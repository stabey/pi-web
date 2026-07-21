import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";

async function GET__secureImpl() {
  return NextResponse.json({ ok: true });
}

export const GET = withSecureRoute(GET__secureImpl);
