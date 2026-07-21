// Client-side transparent encryption. Installs a global `fetch` wrapper that
// encrypts JSON request bodies and decrypts JSON responses for same-origin
// `/api/*` calls, negotiating an AES key via an ECDH handshake on first use.

import {
  aesDecrypt,
  aesEncrypt,
  deriveAesKey,
  exportPublicKey,
  generateEcdhKeyPair,
  importPeerPublicKey,
  isEnvelope,
  ACCEPT_HEADER,
  ENC_HEADER,
  KID_HEADER,
  REKEY_HEADER,
  type Envelope,
} from "./core";

const HANDSHAKE_PATH = "/api/crypto/handshake";

type Session = { kid: string; key: CryptoKey; expiresAt: number };

let session: Session | null = null;
let handshakeInFlight: Promise<Session> | null = null;
let originalFetch: typeof fetch;

async function doHandshake(): Promise<Session> {
  const pair = await generateEcdhKeyPair();
  const clientPublicKey = await exportPublicKey(pair.publicKey);
  const res = await originalFetch(HANDSHAKE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientPublicKey }),
  });
  if (!res.ok) throw new Error(`Handshake failed: HTTP ${res.status}`);
  const body = (await res.json()) as { kid: string; serverPublicKey: string; expiresIn?: number };
  const peer = await importPeerPublicKey(body.serverPublicKey);
  const key = await deriveAesKey(pair.privateKey, peer);
  // Refresh a little early to avoid racing the server-side expiry.
  const ttlMs = (body.expiresIn ?? 3600) * 1000;
  return { kid: body.kid, key, expiresAt: Date.now() + ttlMs - 30_000 };
}

async function ensureSession(force = false): Promise<Session> {
  if (!force && session && session.expiresAt > Date.now()) return session;
  if (force) session = null;
  if (!handshakeInFlight) {
    handshakeInFlight = doHandshake()
      .then((s) => { session = s; return s; })
      .finally(() => { handshakeInFlight = null; });
  }
  return handshakeInFlight;
}

function pathnameOf(url: string): string | null {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return null;
  }
}

function shouldIntercept(input: RequestInfo | URL): input is string | URL {
  // Only intercept plain string / URL requests to our own /api/*, excluding the
  // handshake endpoint. Request-object inputs and cross-origin calls pass through.
  if (typeof input !== "string" && !(input instanceof URL)) return false;
  const path = pathnameOf(input.toString());
  if (!path) return false;
  if (!path.startsWith("/api/")) return false;
  if (path === HANDSHAKE_PATH) return false;
  return true;
}

async function secureFetch(input: string | URL, init: RequestInit | undefined, allowRekey: boolean): Promise<Response> {
  const s = await ensureSession();
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  headers.set(ACCEPT_HEADER, "1");
  headers.set(KID_HEADER, s.kid);

  let body = init?.body;
  if (typeof body === "string" && body.length > 0 && method !== "GET" && method !== "HEAD") {
    const envelope = await aesEncrypt(s.key, body);
    body = JSON.stringify(envelope);
    headers.set(ENC_HEADER, "1");
    headers.set("Content-Type", "application/json");
  }

  const res = await originalFetch(input, { ...init, method, headers, body });

  // Server evicted/expired our key: re-handshake once and retry.
  if (res.headers.get(REKEY_HEADER) === "1" && allowRekey) {
    await ensureSession(true);
    return secureFetch(input, init, false);
  }

  if (res.headers.get(ENC_HEADER) === "1") {
    const envelope = JSON.parse(await res.text()) as Envelope;
    if (!isEnvelope(envelope)) return res;
    const plaintext = await aesDecrypt(s.key, envelope);
    const outHeaders = new Headers(res.headers);
    outHeaders.delete(ENC_HEADER);
    outHeaders.delete("Content-Length"); // envelope length no longer matches plaintext
    return new Response(plaintext, { status: res.status, statusText: res.statusText, headers: outHeaders });
  }

  return res;
}

export function installSecureFetch(): void {
  if (typeof window === "undefined") return;
  const flag = "__piSecureFetchInstalled";
  if ((window as unknown as Record<string, unknown>)[flag]) return;
  (window as unknown as Record<string, unknown>)[flag] = true;

  originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!shouldIntercept(input)) return originalFetch(input, init);
    try {
      return await secureFetch(input, init, true);
    } catch (error) {
      // Never break the app on a crypto failure: fall back to a plain request.
      console.error("[pi-crypto] secure fetch failed, falling back to plaintext:", error);
      return originalFetch(input, init);
    }
  };

  // Warm up the handshake so the first real request is fast.
  void ensureSession().catch(() => {});
}
