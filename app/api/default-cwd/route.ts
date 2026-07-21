import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { ensureChatCwd } from "@/lib/server-config";

// POST /api/default-cwd
// Creates the configured chat cwd if it doesn't exist and returns the path.
async function POST__secureImpl() {
  try {
    return NextResponse.json({ cwd: ensureChatCwd(), mode: "chat" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export const POST = withSecureRoute(POST__secureImpl);
