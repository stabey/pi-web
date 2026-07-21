import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/admin-auth";

async function POST__secureImpl() {
  const res = NextResponse.json({ success: true });
  clearAdminCookie(res);
  return res;
}

export const POST = withSecureRoute(POST__secureImpl);
