import { NextResponse } from "next/server";
import { readTransportConfig } from "@/lib/transport-config";
import { writeUploadChunk } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await params;
    const body = await req.json() as { index: unknown; total: unknown; data: unknown; sha256: unknown };
    const config = readTransportConfig();
    const maxChunkBytes = Math.max(128, config.maxChunkBytes - config.safetyMarginBytes);
    const result = writeUploadChunk("asset", assetId, body, maxChunkBytes);
    return NextResponse.json({ ok: true, index: result.index });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
