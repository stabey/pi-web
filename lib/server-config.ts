import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import path from "path";
import type { AgentMode } from "./agent-modes";

const DEFAULT_CHAT_ROOT = "/data/chat";
const DEFAULT_WORKSPACE_ROOTS = "/data/workspaces";
const DEFAULT_UPLOAD_ROOT = "/data/uploads";

function splitRoots(value: string): string[] {
  return value
    .split(/[,\n]/)
    .flatMap((part) => part.split(path.delimiter))
    .map((part) => part.trim())
    .filter(Boolean);
}

export function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return path.join(homedir(), input.slice(2));
  return input;
}

export function normalizeAbsolutePath(input: string): string {
  const expanded = expandHome(input.trim());
  return path.resolve(expanded);
}

export function getPiAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || path.join(homedir(), ".pi", "agent");
}

export function getChatRoot(): string {
  return normalizeAbsolutePath(process.env.PI_WEB_CHAT_ROOT || DEFAULT_CHAT_ROOT);
}

export function getChatCwd(): string {
  return path.join(getChatRoot(), "default");
}

export function ensureChatCwd(): string {
  const cwd = getChatCwd();
  mkdirSync(cwd, { recursive: true });
  return cwd;
}

export function getWorkspaceRoots(): string[] {
  const raw = process.env.PI_WEB_WORKSPACE_ROOTS || DEFAULT_WORKSPACE_ROOTS;
  return [...new Set(splitRoots(raw).map(normalizeAbsolutePath))];
}

export function getUploadRoot(): string {
  return normalizeAbsolutePath(process.env.PI_WEB_UPLOAD_ROOT || DEFAULT_UPLOAD_ROOT);
}

export function isPathInsideRoot(target: string, root: string): boolean {
  const normalizedTarget = path.resolve(target);
  const normalizedRoot = path.resolve(root);
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export function isPathInsideAnyRoot(target: string, roots: string[]): boolean {
  return roots.some((root) => isPathInsideRoot(target, root));
}

export function isChatCwd(cwd: string): boolean {
  return isPathInsideRoot(cwd, getChatRoot());
}

export function isWorkspaceCwd(cwd: string): boolean {
  return isPathInsideAnyRoot(cwd, getWorkspaceRoots());
}

export function getModeForCwd(cwd: string): AgentMode | null {
  const normalized = normalizeAbsolutePath(cwd);
  if (isChatCwd(normalized)) return "chat";
  if (isWorkspaceCwd(normalized)) return "coding";
  return null;
}

export function validateWorkspaceCwd(cwd: unknown): { ok: true; cwd: string } | { ok: false; error: string; status: number } {
  if (typeof cwd !== "string" || !cwd.trim()) {
    return { ok: false, error: "cwd is required", status: 400 };
  }

  const normalized = normalizeAbsolutePath(cwd);
  if (!isWorkspaceCwd(normalized)) {
    return { ok: false, error: `Directory is outside configured workspace roots: ${cwd}`, status: 403 };
  }

  try {
    const stat = statSync(normalized);
    if (!stat.isDirectory()) {
      return { ok: false, error: `Path is not a directory: ${cwd}`, status: 400 };
    }
  } catch {
    return { ok: false, error: `Directory does not exist: ${cwd}`, status: 400 };
  }

  return { ok: true, cwd: normalized };
}

export type WorkspaceInfo = {
  path: string;
  name: string;
  root: string;
};

export function listWorkspaces(): { roots: string[]; workspaces: WorkspaceInfo[] } {
  const roots = getWorkspaceRoots();
  const workspaces: WorkspaceInfo[] = [];

  for (const root of roots) {
    if (!existsSync(root)) continue;
    try {
      const rootStat = statSync(root);
      if (rootStat.isDirectory()) {
        workspaces.push({ path: root, name: path.basename(root) || root, root });
      }
      for (const name of readdirSync(root)) {
        const full = path.join(root, name);
        try {
          if (statSync(full).isDirectory()) {
            workspaces.push({ path: full, name, root });
          }
        } catch {
          // Skip entries that disappear or cannot be inspected.
        }
      }
    } catch {
      // Skip unreadable roots.
    }
  }

  const seen = new Set<string>();
  return {
    roots,
    workspaces: workspaces.filter((workspace) => {
      if (seen.has(workspace.path)) return false;
      seen.add(workspace.path);
      return true;
    }),
  };
}
