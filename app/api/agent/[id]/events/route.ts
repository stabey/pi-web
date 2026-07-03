import { randomUUID } from "crypto";
import { resolveSessionPath } from "@/lib/session-reader";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { defaultToolPresetForMode, toolNamesForPreset } from "@/lib/agent-modes";
import { getModeForCwd } from "@/lib/server-config";
import { readTransportConfig } from "@/lib/transport-config";

export const dynamic = "force-dynamic";

// GET /api/agent/[id]/events - SSE stream of agent events
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Fast path: already-running session
  let session = getRpcSession(id);
  if (!session || !session.isAlive()) {
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return new Response("Session not found", { status: 404 });
    }
    const cwd = SessionManager.open(filePath).getHeader()?.cwd ?? process.cwd();
    const mode = getModeForCwd(cwd);
    if (!mode) {
      return new Response("Session cwd is outside configured chat/workspace roots", { status: 403 });
    }
    const toolNames = toolNamesForPreset(defaultToolPresetForMode(mode));
    try {
      ({ session } = await startRpcSession(id, filePath, cwd, toolNames));
    } catch (error) {
      return new Response(`Failed to start agent: ${error}`, { status: 500 });
    }
  }

  const transportConfig = readTransportConfig();
  const maxEventBytes = transportConfig.sseMaxEventBytes;

  const stream = new ReadableStream({
    start(controller) {
      const textEncoder = new TextEncoder();
      const enqueue = (text: string) => {
        controller.enqueue(textEncoder.encode(text));
      };
      const encode = (data: unknown) => {
        const json = JSON.stringify(data);
        if (Buffer.byteLength(json, "utf8") <= maxEventBytes) {
          enqueue(`data: ${json}\n\n`);
          return;
        }

        const id = `evt_${randomUUID().replace(/-/g, "")}`;
        const bytes = Buffer.from(json, "utf8");
        const chunkBytes = Math.max(256, Math.floor((maxEventBytes - 256) * 0.7));
        const total = Math.ceil(bytes.length / chunkBytes);
        for (let seq = 0; seq < total; seq += 1) {
          const chunk = bytes.subarray(seq * chunkBytes, Math.min(bytes.length, (seq + 1) * chunkBytes));
          enqueue(`event: binary_chunk\ndata: ${JSON.stringify({
            id,
            seq,
            total,
            encoding: "identity+base64url",
            data: chunk.toString("base64url"),
          })}\n\n`);
        }
        enqueue(`event: binary_done\ndata: ${JSON.stringify({ id })}\n\n`);
      };

      // Send initial connected event
      encode({ type: "connected", sessionId: id });

      const unsubscribe = session.onEvent((event) => {
        encode(event);
      });

      // Heartbeat every 30s to prevent server/proxy timeout (Next.js default ~120-150s)
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(":\n\n"));
        } catch {
          // controller already closed
        }
      }, 30_000);

      // Cleanup when client disconnects
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      };

      // Detect client disconnect via abort signal
      req.signal?.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
