import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { commitUpload } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

async function POST__secureImpl(
  req: Request,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  try {
    const { uploadId } = await params;
    const body = await req.json() as { total: unknown; compressedBytes?: unknown; sha256: unknown };
    commitUpload("agent-command", uploadId, body);
    return NextResponse.json({ ok: true, ready: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export const POST = withSecureRoute(POST__secureImpl);
