import { NextResponse, type NextRequest } from "next/server";

export const ADMIN_AUTH_COOKIE = "pi_web_admin";
export type UserRole = "admin";

export type AdminSession = {
  user: string;
  role: UserRole;
  exp: number;
};

const DEFAULT_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function getAuthSecret(): string | null {
  return process.env.PI_WEB_AUTH_SECRET || null;
}

export function isAdminAuthRequired(): boolean {
  return process.env.PI_WEB_AUTH_REQUIRED === "true";
}

export function getAdminUser(): string {
  return process.env.PI_WEB_ADMIN_USER || "admin";
}

export function getSessionMaxAgeSeconds(): number {
  const raw = Number(process.env.PI_WEB_AUTH_MAX_AGE_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_SESSION_MAX_AGE_SECONDS;
}

function shouldUseSecureCookie(): boolean {
  if (process.env.PI_WEB_AUTH_COOKIE_SECURE === "false") return false;
  if (process.env.PI_WEB_AUTH_COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(sig));
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createAdminToken(user = getAdminUser()): Promise<string> {
  const secret = getAuthSecret();
  if (!secret) throw new Error("PI_WEB_AUTH_SECRET is required when PI_WEB_AUTH_REQUIRED=true");

  const payload: AdminSession = {
    user,
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + getSessionMaxAgeSeconds(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyAdminToken(token: string | undefined | null): Promise<AdminSession | null> {
  if (!token) return null;
  const secret = getAuthSecret();
  if (!secret) return null;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  const expected = await sign(payload, secret);
  if (!(await timingSafeEqual(signature, expected))) return null;

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as Partial<AdminSession>;
    if (session.role !== "admin" || typeof session.user !== "string" || typeof session.exp !== "number") {
      return null;
    }
    if (session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session as AdminSession;
  } catch {
    return null;
  }
}

export async function getAdminSessionFromRequest(req: NextRequest | Request): Promise<AdminSession | null> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_AUTH_COOKIE}=`));
  if (!cookie) return null;
  return verifyAdminToken(decodeURIComponent(cookie.slice(ADMIN_AUTH_COOKIE.length + 1)));
}

export async function requireAdmin(req: NextRequest | Request): Promise<NextResponse | null> {
  if (!isAdminAuthRequired()) return null;
  const session = await getAdminSessionFromRequest(req);
  if (session) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function setAdminCookie(res: NextResponse, user = getAdminUser()): Promise<void> {
  const token = await createAdminToken(user);
  res.cookies.set(ADMIN_AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: getSessionMaxAgeSeconds(),
  });
}

export function clearAdminCookie(res: NextResponse): void {
  res.cookies.set(ADMIN_AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: 0,
  });
}
