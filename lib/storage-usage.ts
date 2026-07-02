import { existsSync, statSync } from "fs";
import { spawnSync } from "child_process";
import { getChatRoot, getPiAgentDir, getUploadRoot, getWorkspaceRoots, normalizeAbsolutePath } from "./server-config";

export type StorageUsageEntry = {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  error?: string;
};

function cacheRoot(): string {
  return normalizeAbsolutePath(process.env.PI_WEB_CACHE_ROOT || "/data/cache");
}

function pathSizeBytes(target: string): { sizeBytes: number | null; error?: string } {
  if (!existsSync(target)) return { sizeBytes: null };

  try {
    const stat = statSync(target);
    if (!stat.isDirectory()) return { sizeBytes: stat.size };
  } catch (error) {
    return { sizeBytes: null, error: error instanceof Error ? error.message : String(error) };
  }

  const result = spawnSync("du", ["-sk", target], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });

  if (result.error) return { sizeBytes: null, error: result.error.message };
  if (result.status !== 0) {
    return { sizeBytes: null, error: result.stderr.trim() || `du exited with ${result.status}` };
  }

  const kb = Number.parseInt(result.stdout.trim().split(/\s+/)[0] ?? "", 10);
  if (!Number.isFinite(kb)) return { sizeBytes: null, error: "Unable to parse du output" };
  return { sizeBytes: kb * 1024 };
}

export function collectStorageUsage(): { entries: StorageUsageEntry[] } {
  const entries: { id: string; label: string; path: string }[] = [
    { id: "agent", label: "Agent data", path: getPiAgentDir() },
    { id: "chat", label: "Chat data", path: getChatRoot() },
    { id: "workspaces", label: "Workspaces", path: getWorkspaceRoots()[0] ?? "/data/workspaces" },
    { id: "uploads", label: "Uploads", path: getUploadRoot() },
    { id: "cache", label: "Package cache", path: cacheRoot() },
  ];

  return {
    entries: entries.map((entry) => {
      const exists = existsSync(entry.path);
      const usage = pathSizeBytes(entry.path);
      return {
        ...entry,
        exists,
        sizeBytes: usage.sizeBytes,
        error: usage.error,
      };
    }),
  };
}
