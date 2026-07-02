import { NextResponse } from "next/server";
import { ensureChatCwd } from "@/lib/server-config";

// POST /api/default-cwd
// Creates the configured chat cwd if it doesn't exist and returns the path.
export async function POST() {
  try {
    return NextResponse.json({ cwd: ensureChatCwd(), mode: "chat" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
