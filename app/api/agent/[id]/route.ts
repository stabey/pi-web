import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { sendExistingAgentCommand } from "@/lib/agent-server";
import { getRpcSession } from "@/lib/rpc-manager";

// POST /api/agent/[id] - Send a command to an existing session
async function POST__secureImpl(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await req.json() as { type: string; [key: string]: unknown };
    const result = await sendExistingAgentCommand(id, body);
    return NextResponse.json(result.body, { status: result.status ?? 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET /api/agent/[id] - Get current agent state
async function GET__secureImpl(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = getRpcSession(id);
    if (!session || !session.isAlive()) {
      return NextResponse.json({ running: false });
    }

    const state = await session.send({ type: "get_state" });
    return NextResponse.json({ running: true, state });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export const GET = withSecureRoute(GET__secureImpl);
export const POST = withSecureRoute(POST__secureImpl);
