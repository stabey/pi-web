import { TransportConfig } from "@/components/TransportConfig";

export default function TransportSettingsPage() {
  return (
    <main style={{
      minHeight: "100dvh",
      padding: "32px 16px",
      background: "var(--bg)",
      color: "var(--text)",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
    }}>
      <TransportConfig />
    </main>
  );
}
