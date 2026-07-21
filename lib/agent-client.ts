// Client-side helper for agent command transport.
//
// Small commands use the existing JSON POST path. Large commands are compressed
// and uploaded through /api/transport before execution. Images are always
// uploaded as assets so prompt JSON does not carry base64 blobs.

type BrowserCompression = "identity" | "gzip";

type BrowserTransportConfig = {
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

type AgentCommandTarget =
  | { type: "new-session" }
  | { type: "session"; sessionId: string };

type AgentImage = {
  type: "image";
  data: string;
  mimeType: string;
};

type AgentFile = {
  type: "file";
  name: string;
  mimeType: string;
  data: string; // base64
};

type AgentRouteResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
  sessionId?: string;
  mode?: string;
  cwd?: string;
  toolPreset?: string;
};

export type NewAgentCommandResponse<T = unknown> = AgentRouteResponse<T> & {
  sessionId: string;
};

const DEFAULT_CLIENT_TRANSPORT_CONFIG: BrowserTransportConfig = {
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

const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_ATTACHMENTS_PER_MESSAGE = 10; // images + files combined
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const textEncoder = new TextEncoder();

function normalizeConfig(input: unknown): BrowserTransportConfig {
  const raw = input && typeof input === "object" && "transport" in input
    ? (input as { transport?: unknown }).transport
    : input;
  const config = raw && typeof raw === "object" ? raw as Partial<BrowserTransportConfig> : {};
  return {
    ...DEFAULT_CLIENT_TRANSPORT_CONFIG,
    ...config,
    compression: config.compression === "identity" ? "identity" : "gzip",
    parallelUploads: Math.max(1, Math.min(8, Number(config.parallelUploads ?? DEFAULT_CLIENT_TRANSPORT_CONFIG.parallelUploads))),
    retryMax: Math.max(0, Math.min(10, Number(config.retryMax ?? DEFAULT_CLIENT_TRANSPORT_CONFIG.retryMax))),
  };
}

async function getTransportConfig(): Promise<BrowserTransportConfig> {
  try {
    const res = await fetch("/api/transport/config", { cache: "no-store" });
    if (!res.ok) return DEFAULT_CLIENT_TRANSPORT_CONFIG;
    return normalizeConfig(await res.json());
  } catch {
    return DEFAULT_CLIENT_TRANSPORT_CONFIG;
  }
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok || body.error) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

async function requestJsonWithRetry<T>(url: string, init: RequestInit, retryMax: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryMax; attempt += 1) {
    try {
      return await requestJson<T>(url, init);
    } catch (error) {
      lastError = error;
      if (attempt >= retryMax) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function base64ToBytes(input: string): Uint8Array {
  const base64 = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function encodeCommandBytes(bytes: Uint8Array, config: BrowserTransportConfig): Promise<{
  bytes: Uint8Array;
  encoding: BrowserCompression;
}> {
  if (config.compression !== "gzip" || typeof CompressionStream === "undefined") {
    return { bytes, encoding: "identity" };
  }
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return { bytes: compressed, encoding: "gzip" };
}

function jsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(value));
}

function readImage(input: unknown): AgentImage {
  if (!input || typeof input !== "object") throw new Error("Invalid image attachment");
  const image = input as Partial<AgentImage>;
  if (image.type !== "image" || typeof image.data !== "string" || typeof image.mimeType !== "string") {
    throw new Error("Invalid image attachment");
  }
  return { type: "image", data: image.data, mimeType: image.mimeType };
}

async function uploadBytes(
  baseUrl: string,
  bytes: Uint8Array,
  maxChunkBytes: number,
  sha256: string,
  config: BrowserTransportConfig,
): Promise<void> {
  if (bytes.length === 0) throw new Error("Cannot upload an empty payload");
  const total = Math.ceil(bytes.length / maxChunkBytes);
  let nextIndex = 0;

  async function uploadNext(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) return;

      const chunk = bytes.subarray(index * maxChunkBytes, Math.min(bytes.length, (index + 1) * maxChunkBytes));
      const chunkSha256 = await sha256Hex(chunk);
      await requestJsonWithRetry(`${baseUrl}/chunks`, {
        method: "POST",
        body: JSON.stringify({
          index,
          total,
          data: bytesToBase64Url(chunk),
          sha256: chunkSha256,
        }),
      }, config.retryMax);
    }
  }

  const workers = Array.from({ length: Math.min(config.parallelUploads, total) }, () => uploadNext());
  await Promise.all(workers);
  await requestJson(`${baseUrl}/commit`, {
    method: "POST",
    body: JSON.stringify({ total, compressedBytes: bytes.length, sha256 }),
  });
}

function readFile(input: unknown): AgentFile {
  if (!input || typeof input !== "object") throw new Error("Invalid file attachment");
  const file = input as Partial<AgentFile>;
  if (file.type !== "file" || typeof file.data !== "string" || typeof file.mimeType !== "string" || typeof file.name !== "string") {
    throw new Error("Invalid file attachment");
  }
  return { type: "file", name: file.name, mimeType: file.mimeType, data: file.data };
}

async function uploadAsset(image: AgentImage, config: BrowserTransportConfig): Promise<string> {
  const bytes = base64ToBytes(image.data);
  if (bytes.length > config.assetMaxBytes) throw new Error("Image is too large");
  const sha256 = await sha256Hex(bytes);
  const created = await requestJson<{ assetId: string; maxChunkBytes: number }>("/api/assets/create", {
    method: "POST",
    body: JSON.stringify({
      category: "image",
      mimeType: image.mimeType,
      originalBytes: bytes.length,
      sha256,
    }),
  });
  await uploadBytes(`/api/assets/${encodeURIComponent(created.assetId)}`, bytes, created.maxChunkBytes, sha256, config);
  return created.assetId;
}

async function uploadFileAsset(file: AgentFile, config: BrowserTransportConfig): Promise<string> {
  const bytes = base64ToBytes(file.data);
  if (bytes.length > MAX_FILE_BYTES) throw new Error(`File is too large: ${file.name}`);
  const sha256 = await sha256Hex(bytes);
  const created = await requestJson<{ assetId: string; maxChunkBytes: number }>("/api/assets/create", {
    method: "POST",
    body: JSON.stringify({
      category: "file",
      mimeType: file.mimeType,
      fileName: file.name,
      originalBytes: bytes.length,
      sha256,
    }),
  });
  await uploadBytes(`/api/assets/${encodeURIComponent(created.assetId)}`, bytes, created.maxChunkBytes, sha256, config);
  return created.assetId;
}

async function prepareCommandAssets(
  command: Record<string, unknown>,
  config: BrowserTransportConfig,
): Promise<Record<string, unknown>> {
  const images = Array.isArray(command.images) ? command.images : [];
  const files = Array.isArray(command.files) ? command.files : [];
  if (images.length === 0 && files.length === 0) return command;
  if (images.length > MAX_IMAGES_PER_MESSAGE) throw new Error("Too many images in one message");
  if (images.length + files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new Error(`Too many attachments in one message (max ${MAX_ATTACHMENTS_PER_MESSAGE})`);
  }

  const { images: _images, files: _files, ...rest } = command;
  void _images;
  void _files;

  const result: Record<string, unknown> = { ...rest };
  if (images.length > 0) {
    result.imageAssetIds = await Promise.all(images.map((image) => uploadAsset(readImage(image), config)));
  }
  if (files.length > 0) {
    result.fileAssetIds = await Promise.all(files.map((file) => uploadFileAsset(readFile(file), config)));
  }
  return result;
}

async function postPlain<T>(
  target: AgentCommandTarget,
  command: Record<string, unknown>,
): Promise<AgentRouteResponse<T>> {
  const url = target.type === "new-session"
    ? "/api/agent/new"
    : `/api/agent/${encodeURIComponent(target.sessionId)}`;
  return requestJson<AgentRouteResponse<T>>(url, {
    method: "POST",
    body: JSON.stringify(command),
  });
}

async function postChunked<T>(
  target: AgentCommandTarget,
  command: Record<string, unknown>,
  config: BrowserTransportConfig,
): Promise<AgentRouteResponse<T>> {
  const original = jsonBytes(command);
  const encoded = await encodeCommandBytes(original, config);
  const sha256 = await sha256Hex(encoded.bytes);
  let uploadId: string | null = null;

  try {
    const created = await requestJson<{ uploadId: string; maxChunkBytes: number }>("/api/transport/create", {
      method: "POST",
      body: JSON.stringify({
        kind: "agent-command",
        encoding: encoded.encoding,
        originalBytes: original.length,
        compressedBytes: encoded.bytes.length,
        sha256,
        target,
      }),
    });
    uploadId = created.uploadId;
    await uploadBytes(`/api/transport/${encodeURIComponent(uploadId)}`, encoded.bytes, created.maxChunkBytes, sha256, config);
    return await requestJson<AgentRouteResponse<T>>(`/api/transport/${encodeURIComponent(uploadId)}/execute`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch (error) {
    if (uploadId) {
      fetch(`/api/transport/${encodeURIComponent(uploadId)}`, { method: "DELETE" }).catch(() => {});
    }
    throw error;
  }
}

async function sendCommand<T>(
  target: AgentCommandTarget,
  command: Record<string, unknown>,
): Promise<AgentRouteResponse<T>> {
  const config = await getTransportConfig();
  const prepared = await prepareCommandAssets(command, config);
  const bytes = jsonBytes(prepared);
  if (!config.enabled || bytes.length <= config.thresholdBytes) {
    return postPlain<T>(target, prepared);
  }
  return postChunked<T>(target, prepared, config);
}

export async function sendAgentCommand<T = unknown>(
  sessionId: string,
  command: Record<string, unknown>,
): Promise<T> {
  const body = await sendCommand<T>({ type: "session", sessionId }, command);
  return body.data as T;
}

export async function sendNewAgentCommand<T = unknown>(
  command: Record<string, unknown>,
): Promise<NewAgentCommandResponse<T>> {
  const body = await sendCommand<T>({ type: "new-session" }, command);
  if (!body.sessionId) throw new Error("New session response did not include sessionId");
  return body as NewAgentCommandResponse<T>;
}
