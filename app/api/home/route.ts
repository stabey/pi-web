import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { homedir } from "os";

async function GET__secureImpl() {
  return NextResponse.json({ home: homedir() });
}

export const GET = withSecureRoute(GET__secureImpl);
