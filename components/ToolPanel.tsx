"use client";

import { useEffect, useRef } from "react";
import { TOOL_PRESETS, type ToolPreset } from "@/lib/agent-modes";

export interface ToolEntry {
  name: string;
  description: string;
  active: boolean;
}

const PRESET_READONLY = TOOL_PRESETS["coding-readonly"];
const PRESET_EDIT = TOOL_PRESETS["coding-edit"];
const PRESET_FULL = TOOL_PRESETS["coding-full"];
const BUILTIN_TOOL_NAMES = new Set(PRESET_FULL);

export function getPresetFromTools(tools: ToolEntry[]): ToolPreset {
  const activeTools = tools.filter(t => t.active);
  if (activeTools.length === 0) return "chat-safe";

  const active = activeTools
    .map(t => t.name)
    .filter(name => BUILTIN_TOOL_NAMES.has(name))
    .sort()
    .join(",");

  if (active === [...PRESET_READONLY].sort().join(",")) return "coding-readonly";
  if (active === [...PRESET_EDIT].sort().join(",")) return "coding-edit";
  if (active === [...PRESET_FULL].sort().join(",")) return "coding-full";
  return "coding-readonly"; // closest match
}

interface Props {
  tools: ToolEntry[];
  onPreset: (preset: ToolPreset, toolNames: string[]) => void;
  onClose: () => void;
}

const PRESETS: { id: ToolPreset; label: string; desc: string; tools: string[] }[] = [
  { id: "coding-readonly", label: "Read", desc: "read · grep · find · ls", tools: PRESET_READONLY },
  { id: "coding-edit", label: "Edit", desc: "read · grep · find · ls · edit · write", tools: PRESET_EDIT },
  { id: "coding-full", label: "Full", desc: "read · grep · find · ls · edit · write · bash", tools: PRESET_FULL },
];

export function ToolPanel({ tools, onPreset, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const current = getPresetFromTools(tools);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const currentIndex = PRESETS.findIndex(p => p.id === current);

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        right: 0,
        zIndex: 200,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 -4px 20px rgba(0,0,0,0.10)",
        width: 260,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Segmented control */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        background: "var(--bg-panel)",
        borderRadius: 8,
        padding: 3,
        gap: 3,
      }}>
        {PRESETS.map((preset) => {
          const isActive = current === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => { onPreset(preset.id, preset.tools); onClose(); }}
              style={{
                padding: "5px 0",
                borderRadius: 6,
                border: "none",
                background: isActive ? "var(--bg)" : "transparent",
                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                fontWeight: isActive ? 600 : 400,
                fontSize: 12,
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Description of current selection */}
      <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
        {currentIndex >= 0 ? PRESETS[currentIndex].desc || "No tools enabled" : ""}
        {current === "chat-safe" && <span> — agent will not use coding tools</span>}
      </div>

      {/* Track bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {PRESETS.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= currentIndex ? "var(--accent)" : "var(--border)",
              transition: "background 0.15s",
            }}
          />
        ))}
      </div>

      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
        takes effect on next turn
      </div>
    </div>
  );
}
