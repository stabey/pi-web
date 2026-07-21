import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { deleteUpload } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

async function DELETE__secureImpl(
  _req: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await params;
    deleteUpload("asset", assetId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export const DELETE = withSecureRoute(DELETE__secureImpl);
