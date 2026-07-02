"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

type WorkspaceTreeEntry = {
  name: string;
  path: string;
  root: string;
  isRoot: boolean;
  canModify: boolean;
};

type WorkspaceTree = {
  roots: string[];
  currentPath: string | null;
  parentPath: string | null;
  canModifyCurrent: boolean;
  entries: WorkspaceTreeEntry[];
};

type WorkspaceManagerProps = {
  selectedWorkspace: string | null;
  onSelectWorkspace: (cwd: string) => void;
  onWorkspacesChanged?: () => void;
};

type PendingAction =
  | { type: "create" }
  | { type: "rename"; path: string; currentName: string }
  | { type: "delete"; path: string; name: string };

function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return `/${parts.slice(0, 2).join("/")}/.../${parts.slice(-2).join("/")}`;
}

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export function WorkspaceManager({ selectedWorkspace, onSelectWorkspace, onWorkspacesChanged }: WorkspaceManagerProps) {
  const [tree, setTree] = useState<WorkspaceTree | null>(null);
  const [path, setPath] = useState<string | null>(selectedWorkspace);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selectedWorkspace) setPath(selectedWorkspace);
  }, [selectedWorkspace]);

  const loadTree = useCallback(async (targetPath: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const query = targetPath ? `?path=${encodeURIComponent(targetPath)}` : "";
      const data = await readJson<WorkspaceTree>(await fetch(`/api/workspaces/tree${query}`));
      setTree(data);
      if (!targetPath && data.roots.length === 1 && data.currentPath === null) {
        setPath(data.roots[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (targetPath) {
        setPath(null);
      } else {
        setTree(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree(path);
  }, [path, loadTree]);

  const breadcrumbs = useMemo(() => {
    if (!tree?.currentPath) return [];
    const root = tree.roots.find((candidate) => tree.currentPath === candidate || tree.currentPath?.startsWith(`${candidate}/`));
    if (!root) return [{ label: tree.currentPath, path: tree.currentPath }];
    const rel = tree.currentPath.slice(root.length).split("/").filter(Boolean);
    const items = [{ label: root, path: root }];
    let current = root;
    for (const part of rel) {
      current = `${current}/${part}`;
      items.push({ label: part, path: current });
    }
    return items;
  }, [tree]);

  const refresh = useCallback(() => {
    void loadTree(path);
  }, [loadTree, path]);

  const startCreate = useCallback(() => {
    setPending({ type: "create" });
    setNameValue("");
    setError(null);
  }, []);

  const startRename = useCallback((entry: WorkspaceTreeEntry) => {
    setPending({ type: "rename", path: entry.path, currentName: entry.name });
    setNameValue(entry.name);
    setError(null);
  }, []);

  const startDelete = useCallback((entry: WorkspaceTreeEntry) => {
    setPending({ type: "delete", path: entry.path, name: entry.name });
    setNameValue("");
    setError(null);
  }, []);

  const cancelPending = useCallback(() => {
    setPending(null);
    setNameValue("");
    setError(null);
  }, []);

  const submitPending = useCallback(async () => {
    if (!pending || busy) return;
    if (pending.type !== "delete" && !nameValue.trim()) return;
    setBusy(true);
    setError(null);

    try {
      if (pending.type === "create") {
        if (!tree?.currentPath) throw new Error("Open a workspace root first");
        const data = await readJson<{ workspace: WorkspaceTreeEntry }>(await fetch("/api/workspaces/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parent: tree.currentPath, name: nameValue.trim() }),
        }));
        setPending(null);
        setNameValue("");
        onWorkspacesChanged?.();
        await loadTree(tree.currentPath);
        onSelectWorkspace(data.workspace.path);
        return;
      }

      if (pending.type === "rename") {
        const data = await readJson<{ workspace: WorkspaceTreeEntry }>(await fetch("/api/workspaces/rename", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: pending.path, name: nameValue.trim() }),
        }));
        setPending(null);
        setNameValue("");
        onWorkspacesChanged?.();
        await loadTree(tree?.currentPath ?? null);
        if (selectedWorkspace === pending.path) onSelectWorkspace(data.workspace.path);
        return;
      }

      const data = await readJson<{ parentPath: string | null }>(await fetch("/api/workspaces/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pending.path }),
      }));
      setPending(null);
      setNameValue("");
      onWorkspacesChanged?.();
      if (path === pending.path || selectedWorkspace === pending.path) {
        const nextPath = data.parentPath ?? null;
        setPath(nextPath);
        if (nextPath) onSelectWorkspace(nextPath);
      } else {
        await loadTree(tree?.currentPath ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [busy, loadTree, nameValue, onSelectWorkspace, onWorkspacesChanged, path, pending, selectedWorkspace, tree?.currentPath]);

  const currentIsSelected = !!tree?.currentPath && tree.currentPath === selectedWorkspace;

  return (
    <div style={shellStyle}>
      <div style={toolbarStyle}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {tree?.currentPath ? (
            <div style={crumbStyle}>
              {breadcrumbs.map((item, index) => (
                <span key={item.path} style={{ display: "inline-flex", alignItems: "center", minWidth: 0 }}>
                  {index > 0 && <span style={{ color: "var(--text-dim)", padding: "0 5px" }}>/</span>}
                  <button
                    type="button"
                    onClick={() => setPath(item.path)}
                    style={{
                      ...crumbButtonStyle,
                      maxWidth: index === 0 ? 220 : 160,
                      fontFamily: index === 0 ? "var(--font-mono)" : "inherit",
                    }}
                    title={item.path}
                  >
                    {index === 0 ? shortPath(item.label) : item.label}
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>/data/workspaces</div>
          )}
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedWorkspace ?? "No workspace selected"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {tree?.parentPath && (
            <button type="button" onClick={() => setPath(tree.parentPath)} style={ghostButtonStyle}>Up</button>
          )}
          <button type="button" onClick={refresh} disabled={loading} style={ghostButtonStyle}>Refresh</button>
          <button type="button" onClick={startCreate} disabled={!tree?.currentPath} style={primaryButtonStyle}>New Folder</button>
          {tree?.currentPath && (
            <button
              type="button"
              onClick={() => onSelectWorkspace(tree.currentPath!)}
              disabled={currentIsSelected}
              style={{
                ...ghostButtonStyle,
                color: currentIsSelected ? "#16a34a" : "var(--text-muted)",
                cursor: currentIsSelected ? "default" : "pointer",
              }}
            >
              {currentIsSelected ? "Selected" : "Use Current"}
            </button>
          )}
        </div>
      </div>

      {pending && (
        <div style={actionBarStyle}>
          {pending.type === "delete" ? (
            <>
              <span style={{ flex: 1, minWidth: 0, color: "#ef4444", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Delete empty folder {pending.name}?
              </span>
              <button type="button" onClick={cancelPending} disabled={busy} style={ghostButtonStyle}>Cancel</button>
              <button type="button" onClick={submitPending} disabled={busy} style={dangerButtonStyle}>
                {busy ? "Deleting..." : "Delete"}
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>
                {pending.type === "create" ? "New folder" : `Rename ${pending.currentName}`}
              </span>
              <input
                value={nameValue}
                onChange={(event) => setNameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitPending();
                  if (event.key === "Escape") cancelPending();
                }}
                autoFocus
                placeholder="folder-name"
                style={inputStyle}
              />
              <button type="button" onClick={cancelPending} disabled={busy} style={ghostButtonStyle}>Cancel</button>
              <button type="button" onClick={submitPending} disabled={busy || !nameValue.trim()} style={primaryButtonStyle}>
                {busy ? "Saving..." : "Save"}
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <div style={errorStyle}>{error}</div>
      )}

      <div style={listStyle}>
        {loading && <div style={emptyStyle}>Loading...</div>}
        {!loading && !error && tree?.entries.length === 0 && (
          <div style={emptyStyle}>No folders</div>
        )}
        {!loading && tree?.entries.map((entry) => {
          const selected = entry.path === selectedWorkspace;
          return (
            <div
              key={entry.path}
              style={{
                ...rowStyle,
                background: selected ? "var(--bg-selected)" : "transparent",
                borderColor: selected ? "rgba(37,99,235,0.35)" : "var(--border)",
              }}
            >
              <button
                type="button"
                onClick={() => setPath(entry.path)}
                style={rowMainStyle}
                title={entry.path}
              >
                <span style={folderIconStyle}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                  </svg>
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.name}
                  </span>
                  <span style={{ display: "block", marginTop: 2, fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.path}
                  </span>
                </span>
              </button>
              <div style={{ display: "flex", gap: 5, paddingRight: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => onSelectWorkspace(entry.path)}
                  disabled={selected}
                  style={{ ...smallButtonStyle, color: selected ? "#16a34a" : "var(--text-muted)" }}
                >
                  {selected ? "Selected" : "Use"}
                </button>
                <button type="button" onClick={() => startRename(entry)} disabled={!entry.canModify} style={smallButtonStyle}>Rename</button>
                <button
                  type="button"
                  onClick={() => startDelete(entry)}
                  disabled={!entry.canModify}
                  style={{ ...smallButtonStyle, color: entry.canModify ? "#ef4444" : "var(--text-dim)" }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const shellStyle: CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  background: "var(--bg)",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: 12,
  borderBottom: "1px solid var(--border)",
  flexWrap: "wrap",
};

const crumbStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minWidth: 0,
  flexWrap: "wrap",
  rowGap: 3,
};

const crumbButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const ghostButtonStyle: CSSProperties = {
  height: 30,
  padding: "0 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 12,
};

const primaryButtonStyle: CSSProperties = {
  ...ghostButtonStyle,
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  fontWeight: 600,
};

const dangerButtonStyle: CSSProperties = {
  ...ghostButtonStyle,
  borderColor: "rgba(239,68,68,0.35)",
  color: "#ef4444",
};

const actionBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-panel)",
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 160,
  height: 30,
  padding: "0 9px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 12,
  outline: "none",
};

const errorStyle: CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid rgba(239,68,68,0.2)",
  color: "#ef4444",
  background: "rgba(239,68,68,0.08)",
  fontSize: 12,
};

const listStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const rowStyle: CSSProperties = {
  minHeight: 54,
  display: "flex",
  alignItems: "center",
  border: "1px solid var(--border)",
  borderRadius: 7,
  overflow: "hidden",
};

const rowMainStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
};

const folderIconStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--bg-hover)",
  color: "var(--text-muted)",
  flexShrink: 0,
};

const smallButtonStyle: CSSProperties = {
  height: 26,
  padding: "0 8px",
  border: "1px solid var(--border)",
  borderRadius: 5,
  background: "var(--bg)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 11,
};

const emptyStyle: CSSProperties = {
  padding: 24,
  color: "var(--text-dim)",
  fontSize: 12,
  textAlign: "center",
};
