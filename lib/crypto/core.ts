// Isomorphic cryptographic primitives shared by client and server.
//
// Key agreement: ECDH on P-256 (ephemeral per handshake).
// Payload cipher:  AES-256-GCM with a random 96-bit IV per message.
//
// Runs unchanged in the browser and in Node (>= 20) via the WebCrypto API
// exposed on `globalThis.crypto`.

export type Envelope = { iv: string; ct: string };

const subtle = globalThis.crypto.subtle;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Copy into a fresh ArrayBuffer so the value satisfies WebCrypto's BufferSource
// typing (Uint8Array may be backed by SharedArrayBuffer under strict lib types).
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(input: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(input, "base64"));
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await subtle.exportKey("raw", key));
  return bytesToBase64(raw);
}

export async function importPeerPublicKey(base64: string): Promise<CryptoKey> {
  return subtle.importKey("raw", toArrayBuffer(base64ToBytes(base64)), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

export async function deriveAesKey(privateKey: CryptoKey, peerPublicKey: CryptoKey): Promise<CryptoKey> {
  return subtle.deriveKey(
    { name: "ECDH", public: peerPublicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<Envelope> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = toArrayBuffer(textEncoder.encode(plaintext));
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, data));
  return { iv: bytesToBase64(iv), ct: bytesToBase64(ct) };
}

export async function aesDecrypt(key: CryptoKey, envelope: Envelope): Promise<string> {
  const iv = toArrayBuffer(base64ToBytes(envelope.iv));
  const ct = toArrayBuffer(base64ToBytes(envelope.ct));
  const pt = await subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return textDecoder.decode(pt);
}

export function isEnvelope(value: unknown): value is Envelope {
  return !!value && typeof value === "object"
    && typeof (value as Envelope).iv === "string"
    && typeof (value as Envelope).ct === "string";
}

// Wire protocol constants (HTTP headers).
export const ENC_HEADER = "x-pi-enc";        // "1" => body is an Envelope
export const KID_HEADER = "x-pi-kid";        // key id from handshake
export const ACCEPT_HEADER = "x-pi-enc-accept"; // "1" => caller can decrypt responses
export const REKEY_HEADER = "x-pi-rekey";    // "1" => key unknown/expired, re-handshake
