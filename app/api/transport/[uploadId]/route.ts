import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { deleteUpload } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

async function DELETE__secureImpl(
  _req: Request,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  try {
    const { uploadId } = await params;
    deleteUpload("agent-command", uploadId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export const DELETE = withSecureRoute(DELETE__secureImpl);
