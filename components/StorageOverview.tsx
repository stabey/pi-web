"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

type StorageEntry = {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  error?: string;
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function StorageOverview() {
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalBytes = useMemo(() => {
    const total = entries.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0);
    return entries.some((entry) => entry.sizeBytes !== null) ? total : null;
  }, [entries]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/system/storage", { cache: "no-store" });
      const data = await res.json() as { entries?: StorageEntry[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={rootStyle}>
      <div style={toolbarStyle}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Total mapped data</div>
          <div style={{ marginTop: 3, fontSize: 24, fontWeight: 700, color: "var(--text)" }}>{formatBytes(totalBytes)}</div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} style={{ ...buttonStyle, opacity: loading ? 0.55 : 1 }}>
          {loading ? "Scanning..." : "Refresh"}
        </button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <div style={listStyle}>
        {entries.map((entry) => (
          <div key={entry.id} style={rowStyle}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 650, color: "var(--text)" }}>{entry.label}</span>
                <span style={{
                  fontSize: 10,
                  color: entry.exists ? "#16a34a" : "var(--text-dim)",
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  padding: "1px 6px",
                }}>
                  {entry.exists ? "mounted" : "missing"}
                </span>
              </div>
              <div style={pathStyle} title={entry.path}>{entry.path}</div>
              {entry.error && <div style={errorTextStyle}>{entry.error}</div>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: entry.sizeBytes === null ? "var(--text-dim)" : "var(--text)", whiteSpace: "nowrap" }}>
              {formatBytes(entry.sizeBytes)}
            </div>
          </div>
        ))}
        {!loading && entries.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>No storage data</div>
        )}
      </div>
    </div>
  );
}

const rootStyle: CSSProperties = {
  height: "100%",
  overflow: "auto",
  padding: 16,
  boxSizing: "border-box",
};

const toolbarStyle: CSSProperties = {
  minHeight: 78,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  paddingBottom: 14,
  borderBottom: "1px solid var(--border)",
};

const buttonStyle: CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg-panel)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 13,
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  minHeight: 72,
  padding: "12px 0",
  borderBottom: "1px solid var(--border)",
};

const pathStyle: CSSProperties = {
  marginTop: 4,
  color: "var(--text-dim)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const errorStyle: CSSProperties = {
  marginTop: 12,
  padding: "8px 10px",
  border: "1px solid #fecaca",
  borderRadius: 6,
  background: "#fee2e2",
  color: "#991b1b",
  fontSize: 12,
};

const errorTextStyle: CSSProperties = {
  marginTop: 5,
  color: "#ef4444",
  fontSize: 11,
  overflowWrap: "anywhere",
};
