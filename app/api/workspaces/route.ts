import { NextResponse } from "next/server";
import { listWorkspaces } from "@/lib/server-config";

export async function GET() {
  return NextResponse.json(listWorkspaces());
}
