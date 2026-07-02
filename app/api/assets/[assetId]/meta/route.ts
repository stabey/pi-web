import { NextResponse } from "next/server";
import { readUploadMeta } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await params;
    const meta = readUploadMeta("asset", assetId);
    return NextResponse.json({
      assetId: meta.id,
      mimeType: meta.mimeType,
      originalBytes: meta.originalBytes,
      sha256: meta.sha256,
      createdAt: meta.createdAt,
      expiresAt: meta.expiresAt,
      committed: meta.committed,
      fileName: meta.fileName,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 404 });
  }
}
