import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { allowFileRoot } from "@/lib/file-access";
import { startRpcSession } from "@/lib/rpc-manager";
import {
  defaultToolPresetForMode,
  isAgentMode,
  isToolPreset,
  toolNamesForPreset,
  type AgentMode,
  type ToolPreset,
} from "@/lib/agent-modes";
import { ensureChatCwd, validateWorkspaceCwd } from "@/lib/server-config";

// POST /api/agent/new  body: { mode?: "chat" | "coding"; cwd?: string; type: string; message?: string; ... }
// Spawns a brand-new pi session. Most calls immediately send the first command;
// type:"ensure_session" only creates the runtime so clients can query commands.
// Returns { sessionId, data } where sessionId is pi's real session id.
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      cwd?: unknown;
      mode?: unknown;
      toolPreset?: unknown;
      [key: string]: unknown;
    };
    const { cwd: requestedCwd, mode: requestedMode, toolPreset: requestedPreset, ...command } = body;

    const mode: AgentMode = isAgentMode(requestedMode)
      ? requestedMode
      : typeof requestedCwd === "string" && requestedCwd.trim()
        ? "coding"
        : "chat";

    let resolvedCwd: string;
    if (mode === "chat") {
      resolvedCwd = ensureChatCwd();
    } else {
      const validated = validateWorkspaceCwd(requestedCwd);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: validated.status });
      }
      resolvedCwd = validated.cwd;
    }

    if (!existsSync(resolvedCwd)) {
      return NextResponse.json({ error: `Directory does not exist: ${resolvedCwd}` }, { status: 400 });
    }

    // Use a one-time key so startRpcSession's lock doesn't conflict with real session ids
    const { provider, modelId, thinkingLevel, ...promptCommand } = command as { provider?: string; modelId?: string; toolNames?: string[]; thinkingLevel?: string; [key: string]: unknown };
    const preset: ToolPreset = isToolPreset(requestedPreset)
      ? requestedPreset
      : defaultToolPresetForMode(mode);
    const activeToolNames = mode === "chat"
      ? toolNamesForPreset("chat-safe")
      : toolNamesForPreset(preset);

    const tempKey = `__new__${Date.now()}`;
    const { session, realSessionId } = await startRpcSession(tempKey, "", resolvedCwd, activeToolNames);

    // Keep the files-route allowed-roots cache (see app/api/files/[...path]/route.ts)
    // in sync so the new cwd is immediately readable via /api/files. Without this,
    // a file request under a brand-new cwd would 403 for up to the cache TTL.
    if (mode === "coding") allowFileRoot(resolvedCwd);

    // Apply pre-selected model before sending the prompt
    if (provider && modelId) {
      await session.send({ type: "set_model", provider, modelId });
    }

    // Apply pre-selected thinking level before sending the prompt
    if (thinkingLevel) {
      await session.send({ type: "set_thinking_level", level: thinkingLevel });
    }

    if (promptCommand.type === "ensure_session") {
      return NextResponse.json({ success: true, sessionId: realSessionId, mode, cwd: resolvedCwd, toolPreset: preset, data: null });
    }

    const result = await session.send(promptCommand);

    return NextResponse.json({ success: true, sessionId: realSessionId, mode, cwd: resolvedCwd, toolPreset: preset, data: result });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
