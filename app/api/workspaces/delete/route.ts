import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { deleteWorkspaceFolder } from "@/lib/workspace-manager";

export async function DELETE(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json() as { path?: unknown };
    return NextResponse.json(deleteWorkspaceFolder(body.path));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
