import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { renameWorkspaceFolder } from "@/lib/workspace-manager";

async function PATCH__secureImpl(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json() as { path?: unknown; name?: unknown };
    return NextResponse.json({ workspace: renameWorkspaceFolder(body.path, body.name) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export const PATCH = withSecureRoute(PATCH__secureImpl);
