import { NextResponse } from "next/server";
import { commitUpload } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await params;
    const body = await req.json() as { total: unknown; compressedBytes?: unknown; sha256: unknown };
    commitUpload("asset", assetId, body);
    return NextResponse.json({ ok: true, ready: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
