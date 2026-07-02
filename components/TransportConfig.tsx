"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type BrowserCompression = "identity" | "gzip";

type TransportConfigState = {
  enabled: boolean;
  thresholdBytes: number;
  maxChunkBytes: number;
  safetyMarginBytes: number;
  compression: BrowserCompression;
  parallelUploads: number;
  retryMax: number;
  sessionTtlSeconds: number;
  assetMaxBytes: number;
  sseMaxEventBytes: number;
};

const DEFAULT_CONFIG: TransportConfigState = {
  enabled: true,
  thresholdBytes: 8192,
  maxChunkBytes: 768,
  safetyMarginBytes: 128,
  compression: "gzip",
  parallelUploads: 1,
  retryMax: 3,
  sessionTtlSeconds: 600,
  assetMaxBytes: 10 * 1024 * 1024,
  sseMaxEventBytes: 8192,
};

type Props = {
  onClose?: () => void;
};

type NumberField = Exclude<keyof TransportConfigState, "enabled" | "compression">;

const numberFields: { key: NumberField; label: string; min: number; step: number }[] = [
  { key: "thresholdBytes", label: "Threshold bytes", min: 512, step: 512 },
  { key: "maxChunkBytes", label: "Max chunk bytes", min: 128, step: 128 },
  { key: "safetyMarginBytes", label: "Safety margin bytes", min: 0, step: 64 },
  { key: "parallelUploads", label: "Parallel uploads", min: 1, step: 1 },
  { key: "retryMax", label: "Retry max", min: 0, step: 1 },
  { key: "sessionTtlSeconds", label: "Upload session TTL seconds", min: 60, step: 60 },
  { key: "assetMaxBytes", label: "Asset max bytes", min: 1024, step: 1024 },
  { key: "sseMaxEventBytes", label: "SSE max event bytes", min: 1024, step: 1024 },
];

function normalize(input: unknown): TransportConfigState {
  const raw = input && typeof input === "object" && "transport" in input
    ? (input as { transport?: unknown }).transport
    : input;
  return { ...DEFAULT_CONFIG, ...(raw && typeof raw === "object" ? raw : {}) } as TransportConfigState;
}

export function TransportConfig({ onClose }: Props) {
  const [config, setConfig] = useState<TransportConfigState>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const effectiveChunkBytes = useMemo(
    () => Math.max(128, config.maxChunkBytes - config.safetyMarginBytes),
    [config.maxChunkBytes, config.safetyMarginBytes],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/transport/config", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setConfig(normalize(data));
      })
      .catch((error) => {
        if (!cancelled) setStatus(String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/transport/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transport: config }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setConfig(normalize(data));
      setStatus("Saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const panel = (
    <div style={{
      width: "min(720px, calc(100vw - 32px))",
      maxHeight: onClose ? "calc(100dvh - 48px)" : undefined,
      overflow: "auto",
      background: "var(--bg-panel)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      boxShadow: onClose ? "0 20px 60px rgba(0,0,0,0.25)" : "none",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px",
        borderBottom: "1px solid var(--border)",
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650, color: "var(--text)" }}>Transport</h2>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
            Effective chunk bytes: {effectiveChunkBytes.toLocaleString()}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              border: "none",
              borderRadius: 6,
              background: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            x
          </button>
        )}
      </div>

      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Enable chunked transport</span>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => setConfig((prev) => ({ ...prev, enabled: event.target.checked }))}
            style={{ width: 18, height: 18, accentColor: "var(--accent)" }}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Compression</span>
          <select
            value={config.compression}
            onChange={(event) => setConfig((prev) => ({ ...prev, compression: event.target.value as BrowserCompression }))}
            style={inputStyle}
          >
            <option value="gzip">gzip</option>
            <option value="identity">identity</option>
          </select>
        </label>
        {numberFields.map((field) => (
          <label key={field.key} style={fieldStyle}>
            <span style={labelStyle}>{field.label}</span>
            <input
              type="number"
              min={field.min}
              step={field.step}
              value={config[field.key]}
              onChange={(event) => {
                const value = Number(event.target.value);
                setConfig((prev) => ({ ...prev, [field.key]: Number.isFinite(value) ? value : prev[field.key] }));
              }}
              style={inputStyle}
            />
          </label>
        ))}
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
      }}>
        <span style={{ color: status === "Saved" ? "var(--success, #16a34a)" : "var(--text-muted)", fontSize: 12 }}>
          {loading ? "Loading..." : status}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          {onClose && (
            <button type="button" onClick={onClose} style={secondaryButtonStyle}>Close</button>
          )}
          <button type="button" onClick={() => void save()} disabled={saving || loading} style={{
            ...primaryButtonStyle,
            opacity: saving || loading ? 0.5 : 1,
            cursor: saving || loading ? "default" : "pointer",
          }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );

  if (!onClose) return panel;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      background: "rgba(0,0,0,0.35)",
    }}>
      {panel}
    </div>
  );
}

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
  minWidth: 0,
};

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: 12,
};

const inputStyle: CSSProperties = {
  height: 34,
  padding: "0 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
};

const secondaryButtonStyle: CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 13,
};

const primaryButtonStyle: CSSProperties = {
  height: 32,
  padding: "0 14px",
  border: "1px solid var(--accent)",
  borderRadius: 6,
  background: "var(--accent)",
  color: "white",
  cursor: "pointer",
  fontSize: 13,
};
