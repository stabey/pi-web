import { NextResponse } from "next/server";
import { listAllSessions } from "@/lib/session-reader";
import { getRunningRpcSessionIds } from "@/lib/rpc-manager";
import { getModeForCwd } from "@/lib/server-config";

export async function GET() {
  try {
    const sessions = await listAllSessions();
    return NextResponse.json({
      sessions: sessions.filter((session) => session.cwd && getModeForCwd(session.cwd)),
      runningSessionIds: getRunningRpcSessionIds(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
