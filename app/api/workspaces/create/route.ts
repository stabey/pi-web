import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createWorkspaceFolder } from "@/lib/workspace-manager";

async function POST__secureImpl(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json() as { parent?: unknown; name?: unknown };
    return NextResponse.json({ workspace: createWorkspaceFolder(body.parent, body.name) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export const POST = withSecureRoute(POST__secureImpl);
