"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ModelsConfig } from "./ModelsConfig";
import { PluginsConfig } from "./PluginsConfig";
import { SkillsConfig } from "./SkillsConfig";
import { StorageOverview } from "./StorageOverview";
import { TransportConfig } from "./TransportConfig";
import { WorkspaceManager } from "./WorkspaceManager";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { AgentMode } from "@/lib/agent-modes";

export type SettingsCategory = "overview" | "models" | "workspaces" | "skills" | "plugins" | "transport";

type SettingsDialogProps = {
  initialCategory?: SettingsCategory;
  mode: AgentMode;
  cwd: string | null;
  selectedWorkspace: string | null;
  sessionId: string | null;
  onClose: () => void;
  onWorkspaceSelect: (cwd: string) => void;
  onWorkspacesChanged?: () => void;
  onPluginsReloaded?: () => void;
};

const categories: { id: SettingsCategory; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "models", label: "Models" },
  { id: "workspaces", label: "Workspaces" },
  { id: "skills", label: "Skills" },
  { id: "plugins", label: "Plugins" },
  { id: "transport", label: "Transport" },
];

export function SettingsDialog({
  initialCategory = "overview",
  mode,
  cwd,
  selectedWorkspace,
  sessionId,
  onClose,
  onWorkspaceSelect,
  onWorkspacesChanged,
  onPluginsReloaded,
}: SettingsDialogProps) {
  const isMobile = useIsMobile();
  const [active, setActive] = useState<SettingsCategory>(initialCategory);

  const activeTitle = useMemo(
    () => categories.find((category) => category.id === active)?.label ?? "Settings",
    [active],
  );

  const missingCwd = (
    <div style={emptyStateStyle}>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Select a workspace first.</div>
    </div>
  );

  const body = (() => {
    if (active === "overview") return <StorageOverview />;
    if (active === "models") return <ModelsConfig embedded />;
    if (active === "workspaces") {
      return (
        <WorkspaceManager
          selectedWorkspace={selectedWorkspace}
          onSelectWorkspace={onWorkspaceSelect}
          onWorkspacesChanged={onWorkspacesChanged}
        />
      );
    }
    if (active === "skills") return cwd ? <SkillsConfig cwd={cwd} embedded /> : missingCwd;
    if (active === "plugins") {
      return cwd ? (
        <PluginsConfig
          cwd={cwd}
          sessionId={sessionId}
          embedded
          onReloaded={onPluginsReloaded}
        />
      ) : missingCwd;
    }
    return <TransportConfig embedded />;
  })();

  return (
    <div
      style={overlayStyle}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        style={{
          ...dialogStyle,
          width: isMobile ? "calc(100vw - 16px)" : "min(1080px, calc(100vw - 32px))",
          height: isMobile ? "calc(100dvh - 16px)" : "min(820px, calc(100dvh - 32px))",
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <aside
          style={{
            ...navStyle,
            width: isMobile ? "100%" : 190,
            borderRight: isMobile ? "none" : "1px solid var(--border)",
            borderBottom: isMobile ? "1px solid var(--border)" : "none",
          }}
        >
          <div style={navHeaderStyle}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Settings</div>
            <button type="button" onClick={onClose} aria-label="Close settings" style={closeButtonStyle}>x</button>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "row" : "column",
              gap: 4,
              overflowX: isMobile ? "auto" : undefined,
              padding: 8,
            }}
          >
            {categories.map((category) => {
              const selected = category.id === active;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActive(category.id)}
                  style={{
                    height: 34,
                    minWidth: isMobile ? 116 : 0,
                    padding: "0 10px",
                    border: "none",
                    borderRadius: 6,
                    background: selected ? "var(--bg-selected)" : "transparent",
                    color: selected ? "var(--text)" : "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                    fontWeight: selected ? 650 : 450,
                    letterSpacing: 0,
                  }}
                  onMouseEnter={(event) => {
                    if (!selected) event.currentTarget.style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(event) => {
                    if (!selected) event.currentTarget.style.background = "transparent";
                  }}
                >
                  {category.label}
                </button>
              );
            })}
          </div>
        </aside>
        <main style={mainStyle}>
          <div style={mainHeaderStyle}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{activeTitle}</div>
              <div style={{ marginTop: 3, fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {mode === "coding" ? selectedWorkspace ?? cwd ?? "/data/workspaces" : cwd ?? "/data/chat/default"}
              </div>
            </div>
          </div>
          <div style={contentStyle}>
            {body}
          </div>
        </main>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 8,
  background: "rgba(0,0,0,0.38)",
};

const dialogStyle: CSSProperties = {
  maxWidth: "calc(100vw - 16px)",
  maxHeight: "calc(100dvh - 16px)",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  boxShadow: "0 18px 60px rgba(0,0,0,0.24)",
  overflow: "hidden",
  display: "flex",
};

const navStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-panel)",
  flexShrink: 0,
};

const navHeaderStyle: CSSProperties = {
  height: 48,
  padding: "0 12px",
  borderBottom: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexShrink: 0,
};

const closeButtonStyle: CSSProperties = {
  width: 30,
  height: 30,
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 20,
  lineHeight: 1,
};

const mainStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const mainHeaderStyle: CSSProperties = {
  height: 48,
  padding: "0 16px",
  borderBottom: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexShrink: 0,
};

const contentStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};

const emptyStateStyle: CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};
