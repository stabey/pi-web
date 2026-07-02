export type AgentMode = "chat" | "coding";

export type ToolPreset =
  | "chat-safe"
  | "coding-readonly"
  | "coding-edit"
  | "coding-full";

export const TOOL_PRESETS: Record<ToolPreset, string[]> = {
  "chat-safe": [],
  "coding-readonly": ["read", "grep", "find", "ls"],
  "coding-edit": ["read", "grep", "find", "ls", "edit", "write"],
  "coding-full": ["read", "grep", "find", "ls", "edit", "write", "bash"],
};

export function isAgentMode(value: unknown): value is AgentMode {
  return value === "chat" || value === "coding";
}

export function isToolPreset(value: unknown): value is ToolPreset {
  return (
    value === "chat-safe" ||
    value === "coding-readonly" ||
    value === "coding-edit" ||
    value === "coding-full"
  );
}

export function defaultToolPresetForMode(mode: AgentMode): ToolPreset {
  return mode === "chat" ? "chat-safe" : "coding-readonly";
}

export function toolNamesForPreset(preset: ToolPreset): string[] {
  return TOOL_PRESETS[preset];
}
