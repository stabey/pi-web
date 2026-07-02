import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAdminUser, isAdminAuthRequired, setAdminCookie } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    const adminUser = getAdminUser();

    if (!isAdminAuthRequired()) {
      return NextResponse.json({ success: true, user: adminUser, authRequired: false });
    }

    const hash = process.env.PI_WEB_ADMIN_PASSWORD_HASH;
    if (!hash) {
      return NextResponse.json({ error: "PI_WEB_ADMIN_PASSWORD_HASH is not configured" }, { status: 500 });
    }

    const ok = username === adminUser && await bcrypt.compare(password, hash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const res = NextResponse.json({ success: true, user: adminUser, role: "admin" });
    await setAdminCookie(res, adminUser);
    return res;
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
