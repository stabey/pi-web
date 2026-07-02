import { NextResponse } from "next/server";
import { getAdminSessionFromRequest, getAdminUser, isAdminAuthRequired } from "@/lib/admin-auth";

export async function GET(req: Request) {
  if (!isAdminAuthRequired()) {
    return NextResponse.json({
      authenticated: true,
      authRequired: false,
      user: getAdminUser(),
      role: "admin",
    });
  }

  const session = await getAdminSessionFromRequest(req);
  return NextResponse.json({
    authenticated: !!session,
    authRequired: true,
    user: session?.user ?? getAdminUser(),
    role: session?.role ?? null,
    exp: session?.exp ?? null,
  }, { status: session ? 200 : 401 });
}
