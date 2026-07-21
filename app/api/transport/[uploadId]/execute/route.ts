import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { createNewAgentCommand, sendExistingAgentCommand } from "@/lib/agent-server";
import { readDecodedCommandPayload } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

async function POST__secureImpl(
  _req: Request,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  try {
    const { uploadId } = await params;
    const { meta, text } = readDecodedCommandPayload(uploadId);
    const command = JSON.parse(text) as Record<string, unknown>;

    if (!meta.target) {
      return NextResponse.json({ error: "Upload target missing" }, { status: 400 });
    }

    const result = meta.target.type === "new-session"
      ? await createNewAgentCommand(command)
      : await sendExistingAgentCommand(meta.target.sessionId, command);

    return NextResponse.json(result.body, { status: result.status ?? 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export const POST = withSecureRoute(POST__secureImpl);
