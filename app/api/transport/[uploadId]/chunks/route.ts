import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { readTransportConfig } from "@/lib/transport-config";
import { writeUploadChunk } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

async function POST__secureImpl(
  req: Request,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  try {
    const { uploadId } = await params;
    const body = await req.json() as { index: unknown; total: unknown; data: unknown; sha256: unknown };
    const config = readTransportConfig();
    const maxChunkBytes = Math.max(128, config.maxChunkBytes - config.safetyMarginBytes);
    const result = writeUploadChunk("agent-command", uploadId, body, maxChunkBytes);
    return NextResponse.json({ ok: true, index: result.index });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export const POST = withSecureRoute(POST__secureImpl);
