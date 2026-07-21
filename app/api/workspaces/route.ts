import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { listWorkspaces } from "@/lib/server-config";

async function GET__secureImpl() {
  return NextResponse.json(listWorkspaces());
}

export const GET = withSecureRoute(GET__secureImpl);
