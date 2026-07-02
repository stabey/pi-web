"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function getNextPath(): string {
  if (typeof window === "undefined") return "/";
  return new URLSearchParams(window.location.search).get("next") || "/";
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((body: { authenticated?: boolean; user?: string }) => {
        if (body.user) setUsername(body.user);
        if (body.authenticated) router.replace(getNextPath());
      })
      .catch(() => {});
  }, [router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok || body.error) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      router.replace(getNextPath());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: "100dvh",
      display: "grid",
      placeItems: "center",
      background: "var(--bg)",
      padding: 20,
    }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: "min(380px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 24,
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--bg-panel)",
          boxShadow: "0 18px 48px rgba(0,0,0,0.12)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20, letterSpacing: 0, color: "var(--text)" }}>Pi Agent Web</h1>
          <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>Admin sign in</p>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
          User
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            style={{
              height: 38,
              border: "1px solid var(--border)",
              borderRadius: 7,
              background: "var(--bg)",
              color: "var(--text)",
              padding: "0 10px",
              fontSize: 14,
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            style={{
              height: 38,
              border: "1px solid var(--border)",
              borderRadius: 7,
              background: "var(--bg)",
              color: "var(--text)",
              padding: "0 10px",
              fontSize: 14,
            }}
          />
        </label>

        {error && (
          <div style={{
            color: "#ef4444",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.24)",
            borderRadius: 7,
            padding: "8px 10px",
            fontSize: 12,
            lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !username.trim() || !password}
          style={{
            height: 38,
            border: "none",
            borderRadius: 7,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 650,
            cursor: loading || !username.trim() || !password ? "not-allowed" : "pointer",
            opacity: loading || !username.trim() || !password ? 0.65 : 1,
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
