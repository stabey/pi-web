import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { createUpload, type TransportTarget } from "@/lib/upload-store";
import { readTransportConfig, type BrowserCompression } from "@/lib/transport-config";

export const dynamic = "force-dynamic";

function numberFrom(input: unknown): number | null {
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function sha256From(input: unknown): string | null {
  return typeof input === "string" && /^[a-f0-9]{64}$/i.test(input) ? input.toLowerCase() : null;
}

function encodingFrom(input: unknown): BrowserCompression | null {
  return input === "identity" || input === "gzip" ? input : null;
}

function targetFrom(input: unknown): TransportTarget | null {
  if (!input || typeof input !== "object") return null;
  const target = input as { type?: unknown; sessionId?: unknown };
  if (target.type === "new-session") return { type: "new-session" };
  if (target.type === "session" && typeof target.sessionId === "string" && target.sessionId.trim()) {
    return { type: "session", sessionId: target.sessionId.trim() };
  }
  return null;
}

async function POST__secureImpl(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    if (body.kind !== "agent-command") {
      return NextResponse.json({ error: "Unsupported transport kind" }, { status: 400 });
    }

    const encoding = encodingFrom(body.encoding);
    const originalBytes = numberFrom(body.originalBytes);
    const compressedBytes = numberFrom(body.compressedBytes);
    const sha256 = sha256From(body.sha256);
    const target = targetFrom(body.target);
    if (!encoding || originalBytes === null || compressedBytes === null || !sha256 || !target) {
      return NextResponse.json({ error: "Invalid transport metadata" }, { status: 400 });
    }

    const config = readTransportConfig();
    const expiresAt = Date.now() + config.sessionTtlSeconds * 1000;
    const meta = createUpload({
      kind: "agent-command",
      encoding,
      originalBytes,
      compressedBytes,
      sha256,
      expiresAt,
      target,
    });
    const maxChunkBytes = Math.max(128, config.maxChunkBytes - config.safetyMarginBytes);

    return NextResponse.json({ uploadId: meta.id, maxChunkBytes, expiresAt });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export const POST = withSecureRoute(POST__secureImpl);
