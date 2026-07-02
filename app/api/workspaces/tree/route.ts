import { NextResponse } from "next/server";
import { listWorkspaceTree } from "@/lib/workspace-manager";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const path = new URL(req.url).searchParams.get("path");
    return NextResponse.json(listWorkspaceTree(path));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
