import { NextResponse } from "next/server";
import { readTransportConfig } from "@/lib/transport-config";
import { createUpload, IMAGE_MIME_ALLOWLIST } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

const ASSET_TTL_MS = 24 * 60 * 60 * 1000;

function numberFrom(input: unknown): number | null {
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function sha256From(input: unknown): string | null {
  return typeof input === "string" && /^[a-f0-9]{64}$/i.test(input) ? input.toLowerCase() : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
    const originalBytes = numberFrom(body.originalBytes);
    const sha256 = sha256From(body.sha256);
    if (!IMAGE_MIME_ALLOWLIST.has(mimeType) || originalBytes === null || !sha256) {
      return NextResponse.json({ error: "Invalid asset metadata" }, { status: 400 });
    }

    const config = readTransportConfig();
    if (originalBytes > config.assetMaxBytes) {
      return NextResponse.json({ error: "Asset is too large" }, { status: 413 });
    }

    const expiresAt = Date.now() + ASSET_TTL_MS;
    const meta = createUpload({
      kind: "asset",
      encoding: "identity",
      originalBytes,
      compressedBytes: originalBytes,
      sha256,
      expiresAt,
      mimeType,
      fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 255) : undefined,
    });
    const maxChunkBytes = Math.max(128, config.maxChunkBytes - config.safetyMarginBytes);

    return NextResponse.json({ assetId: meta.id, maxChunkBytes, expiresAt });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
