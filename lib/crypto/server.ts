// Server-side encryption: ECDH handshake key store + a transparent route
// wrapper that decrypts request bodies and encrypts JSON responses.

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
} from "./core";

type StoredKey = { key: CryptoKey; expiresAt: number };

const KEY_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory key store. Keys are ephemeral per handshake and never persisted.
const keyStore = new Map<string, StoredKey>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [kid, entry] of keyStore) {
    if (entry.expiresAt <= now) keyStore.delete(kid);
  }
}

function randomKid(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `k_${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function getKey(kid: string | null): CryptoKey | null {
  if (!kid) return null;
  const entry = keyStore.get(kid);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    keyStore.delete(kid);
    return null;
  }
  return entry.key;
}

export type HandshakeResult = { kid: string; serverPublicKey: string; expiresIn: number };

export async function performHandshake(clientPublicKey: string): Promise<HandshakeResult> {
  const pair = await generateEcdhKeyPair();
  const serverPublicKey = await exportPublicKey(pair.publicKey);
  const peer = await importPeerPublicKey(clientPublicKey);
  const key = await deriveAesKey(pair.privateKey, peer);
  const kid = randomKid();
  keyStore.set(kid, { key, expiresAt: Date.now() + KEY_TTL_MS });
  pruneExpired();
  return { kid, serverPublicKey, expiresIn: Math.floor(KEY_TTL_MS / 1000) };
}

function rekeyResponse(): Response {
  return new Response(JSON.stringify({ error: "Encryption key expired, re-handshake required" }), {
    status: 409,
    headers: { "Content-Type": "application/json", [REKEY_HEADER]: "1" },
  });
}

function isJsonResponse(res: Response): boolean {
  return (res.headers.get("Content-Type") || "").includes("application/json");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: any, ctx: any) => Promise<Response> | Response;

/**
 * Wraps a Next.js route handler so that:
 *   - an encrypted request body (Envelope) is transparently decrypted, with
 *     `req.json()` / `req.text()` returning the plaintext to the handler;
 *   - a JSON response is transparently encrypted when the caller advertised it
 *     can decrypt (via the accept header).
 * Streaming / non-JSON responses pass through untouched. The handshake route
 * itself must NOT be wrapped.
 */
export function withSecureRoute<H extends RouteHandler>(handler: H): H {
  const wrapped = async (req: Request, ctx: unknown): Promise<Response> => {
    const kid = req.headers.get(KID_HEADER);
    const wantsEncryptedResponse = req.headers.get(ACCEPT_HEADER) === "1";
    const key = getKey(kid);

    if (req.headers.get(ENC_HEADER) === "1") {
      if (!key) return rekeyResponse();
      let plaintext: string;
      try {
        const envelope = JSON.parse(await req.text());
        if (!isEnvelope(envelope)) throw new Error("Malformed envelope");
        plaintext = await aesDecrypt(key, envelope);
      } catch {
        return rekeyResponse();
      }
      // Shadow the body accessors so downstream handler code is unaware of
      // the encryption. Everything else on the request (cookies, headers,
      // nextUrl, signal) is preserved because we mutate the same object.
      const mutable = req as unknown as { json: () => Promise<unknown>; text: () => Promise<string> };
      mutable.json = async () => JSON.parse(plaintext);
      mutable.text = async () => plaintext;
    }

    const res = await handler(req, ctx);

    if (wantsEncryptedResponse && key && isJsonResponse(res)) {
      const bodyText = await res.text();
      const envelope = await aesEncrypt(key, bodyText);
      const headers = new Headers(res.headers);
      headers.set(ENC_HEADER, "1");
      headers.set("Content-Type", "application/json");
      headers.delete("Content-Length");
      // Preserve Set-Cookie exactly (auth login/logout rely on it). Copying via
      // `new Headers(res.headers)` can collapse multiple cookies into one value.
      const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
      const cookies = typeof getSetCookie === "function" ? getSetCookie.call(res.headers) : [];
      if (cookies.length > 0) {
        headers.delete("set-cookie");
        for (const cookie of cookies) headers.append("set-cookie", cookie);
      }
      return new Response(JSON.stringify(envelope), {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    }
    return res;
  };
  return wrapped as unknown as H;
}
