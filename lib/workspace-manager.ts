import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmdirSync } from "fs";
import path from "path";
import { getWorkspaceRoots, isPathInsideRoot, normalizeAbsolutePath } from "./server-config";

export type WorkspaceTreeEntry = {
  name: string;
  path: string;
  root: string;
  isRoot: boolean;
  canModify: boolean;
};

export type WorkspaceTree = {
  roots: string[];
  currentPath: string | null;
  parentPath: string | null;
  canModifyCurrent: boolean;
  entries: WorkspaceTreeEntry[];
};

function workspaceRootFor(target: string): string | null {
  const normalized = normalizeAbsolutePath(target);
  return getWorkspaceRoots().find((root) => isPathInsideRoot(normalized, root)) ?? null;
}

function assertWorkspaceDirectory(input: unknown): { path: string; root: string } {
  if (typeof input !== "string" || !input.trim()) throw new Error("workspace path is required");
  const normalized = normalizeAbsolutePath(input);
  const root = workspaceRootFor(normalized);
  if (!root) throw new Error("workspace path is outside configured roots");
  const stat = lstatSync(normalized);
  if (stat.isSymbolicLink()) throw new Error("workspace symlinks cannot be managed here");
  if (!stat.isDirectory()) throw new Error("workspace path is not a directory");
  return { path: normalized, root };
}

function assertChildName(name: unknown): string {
  if (typeof name !== "string") throw new Error("name is required");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name is required");
  if (trimmed === "." || trimmed === "..") throw new Error("invalid folder name");
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("\0")) throw new Error("folder name cannot contain path separators");
  return trimmed;
}

function isRootPath(target: string, root: string): boolean {
  return path.resolve(target) === path.resolve(root);
}

function entryFor(target: string, root: string): WorkspaceTreeEntry {
  return {
    name: path.basename(target) || target,
    path: target,
    root,
    isRoot: isRootPath(target, root),
    canModify: !isRootPath(target, root),
  };
}

export function listWorkspaceTree(inputPath?: string | null): WorkspaceTree {
  const roots = getWorkspaceRoots();

  if (!inputPath) {
    return {
      roots,
      currentPath: null,
      parentPath: null,
      canModifyCurrent: false,
      entries: roots.filter(existsSync).map((root) => entryFor(root, root)),
    };
  }

  const current = assertWorkspaceDirectory(inputPath);
  const entries: WorkspaceTreeEntry[] = [];

  for (const name of readdirSync(current.path).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))) {
    const full = path.join(current.path, name);
    try {
      const stat = lstatSync(full);
      if (stat.isSymbolicLink() || !stat.isDirectory()) continue;
      entries.push(entryFor(full, current.root));
    } catch {
      // Skip entries that disappear while listing.
    }
  }

  const parent = path.dirname(current.path);
  return {
    roots,
    currentPath: current.path,
    parentPath: isRootPath(current.path, current.root) ? null : parent,
    canModifyCurrent: !isRootPath(current.path, current.root),
    entries,
  };
}

export function createWorkspaceFolder(parentInput: unknown, nameInput: unknown): WorkspaceTreeEntry {
  const parent = assertWorkspaceDirectory(parentInput);
  const name = assertChildName(nameInput);
  const target = path.join(parent.path, name);
  if (!isPathInsideRoot(target, parent.root)) throw new Error("target path is outside configured root");
  if (existsSync(target)) throw new Error("target folder already exists");
  mkdirSync(target, { recursive: false });
  return entryFor(target, parent.root);
}

export function renameWorkspaceFolder(pathInput: unknown, nameInput: unknown): WorkspaceTreeEntry {
  const current = assertWorkspaceDirectory(pathInput);
  if (isRootPath(current.path, current.root)) throw new Error("workspace root cannot be renamed");
  const name = assertChildName(nameInput);
  const target = path.join(path.dirname(current.path), name);
  if (!isPathInsideRoot(target, current.root)) throw new Error("target path is outside configured root");
  if (existsSync(target)) throw new Error("target folder already exists");
  renameSync(current.path, target);
  return entryFor(target, current.root);
}

export function deleteWorkspaceFolder(pathInput: unknown): { parentPath: string | null } {
  const current = assertWorkspaceDirectory(pathInput);
  if (isRootPath(current.path, current.root)) throw new Error("workspace root cannot be deleted");
  rmdirSync(current.path);
  const parentPath = path.dirname(current.path);
  return { parentPath: isRootPath(parentPath, current.root) ? current.root : parentPath };
}
