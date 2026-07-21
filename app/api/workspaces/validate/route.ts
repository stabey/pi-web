import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { validateWorkspaceCwd } from "@/lib/server-config";

async function POST__secureImpl(req: Request) {
  try {
    const body = await req.json() as { cwd?: unknown };
    const result = validateWorkspaceCwd(body.cwd);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, cwd: result.cwd });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export const POST = withSecureRoute(POST__secureImpl);
