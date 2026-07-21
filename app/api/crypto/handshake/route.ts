import { NextResponse } from "next/server";
import { performHandshake } from "@/lib/crypto/server";

export const dynamic = "force-dynamic";

// POST /api/crypto/handshake
// Body: { clientPublicKey: base64(raw ECDH P-256 public key) }
// Returns: { kid, serverPublicKey, expiresIn }
//
// This endpoint MUST remain unencrypted (it bootstraps the shared key) and is
// exempt from admin auth so the login flow can encrypt its own payload.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { clientPublicKey?: unknown };
    if (typeof body.clientPublicKey !== "string" || body.clientPublicKey.length === 0) {
      return NextResponse.json({ error: "Missing clientPublicKey" }, { status: 400 });
    }
    const result = await performHandshake(body.clientPublicKey);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: `Handshake failed: ${String(error)}` }, { status: 400 });
  }
}
