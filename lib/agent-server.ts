import { existsSync } from "fs";
import { resolveSessionPath } from "@/lib/session-reader";
import { startRpcSession, getRpcSession } from "@/lib/rpc-manager";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  defaultToolPresetForMode,
  isAgentMode,
  isToolPreset,
  toolNamesForPreset,
  type AgentMode,
  type ToolPreset,
} from "@/lib/agent-modes";
import { allowFileRoot } from "@/lib/file-access";
import { ensureChatCwd, getModeForCwd, validateWorkspaceCwd } from "@/lib/server-config";
import { readAssetAsImage } from "@/lib/upload-store";

export type AgentActionResult = {
  status?: number;
  body: Record<string, unknown>;
};

async function resolveCommandAssets(command: Record<string, unknown>): Promise<Record<string, unknown>> {
  const assetIds = command.imageAssetIds;
  if (!Array.isArray(assetIds) || assetIds.length === 0) return command;

  const assetImages = assetIds.map((assetId) => {
    if (typeof assetId !== "string") throw new Error("Invalid image asset id");
    return readAssetAsImage(assetId);
  });
  const existingImages = Array.isArray(command.images) ? command.images : [];
  const { imageAssetIds: _imageAssetIds, ...rest } = command;
  void _imageAssetIds;
  return { ...rest, images: [...existingImages, ...assetImages] };
}

export async function createNewAgentCommand(body: Record<string, unknown>): Promise<AgentActionResult> {
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
      return { status: validated.status, body: { error: validated.error } };
    }
    resolvedCwd = validated.cwd;
  }

  if (!existsSync(resolvedCwd)) {
    return { status: 400, body: { error: `Directory does not exist: ${resolvedCwd}` } };
  }

  const { provider, modelId, thinkingLevel, ...rawPromptCommand } = command as {
    provider?: string;
    modelId?: string;
    thinkingLevel?: string;
    [key: string]: unknown;
  };
  const promptCommand = await resolveCommandAssets(rawPromptCommand);
  const preset: ToolPreset = isToolPreset(requestedPreset)
    ? requestedPreset
    : defaultToolPresetForMode(mode);
  const activeToolNames = mode === "chat"
    ? toolNamesForPreset("chat-safe")
    : toolNamesForPreset(preset);

  const tempKey = `__new__${Date.now()}`;
  const { session, realSessionId } = await startRpcSession(tempKey, "", resolvedCwd, activeToolNames);
  if (mode === "coding") allowFileRoot(resolvedCwd);

  if (provider && modelId) {
    await session.send({ type: "set_model", provider, modelId });
  }

  if (thinkingLevel) {
    await session.send({ type: "set_thinking_level", level: thinkingLevel });
  }

  if (promptCommand.type === "ensure_session") {
    return {
      body: { success: true, sessionId: realSessionId, mode, cwd: resolvedCwd, toolPreset: preset, data: null },
    };
  }

  const result = await session.send(promptCommand);
  return {
    body: { success: true, sessionId: realSessionId, mode, cwd: resolvedCwd, toolPreset: preset, data: result },
  };
}

export async function sendExistingAgentCommand(id: string, body: Record<string, unknown>): Promise<AgentActionResult> {
  const command = await resolveCommandAssets(body);

  const existing = getRpcSession(id);
  if (existing?.isAlive()) {
    const result = await existing.send(command);
    return { body: { success: true, data: result } };
  }

  const filePath = await resolveSessionPath(id);
  if (!filePath) {
    return { status: 404, body: { error: "Session not found" } };
  }

  const cwd = SessionManager.open(filePath).getHeader()?.cwd ?? process.cwd();
  const mode = getModeForCwd(cwd);
  if (!mode) {
    return { status: 403, body: { error: "Session cwd is outside configured chat/workspace roots" } };
  }
  const toolNames = toolNamesForPreset(defaultToolPresetForMode(mode));

  const { session } = await startRpcSession(id, filePath, cwd, toolNames);
  const result = await session.send(command);
  return { body: { success: true, data: result } };
}
