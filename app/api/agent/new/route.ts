import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { createNewAgentCommand } from "@/lib/agent-server";

// POST /api/agent/new  body: { mode?: "chat" | "coding"; cwd?: string; type: string; message?: string; ... }
// Spawns a brand-new pi session. Most calls immediately send the first command;
// type:"ensure_session" only creates the runtime so clients can query commands.
async function POST__secureImpl(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const result = await createNewAgentCommand(body);
    return NextResponse.json(result.body, { status: result.status ?? 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export const POST = withSecureRoute(POST__secureImpl);
