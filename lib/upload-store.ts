import { createHash, randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { gunzipSync } from "zlib";
import { getUploadRoot } from "./server-config";
import type { BrowserCompression } from "./transport-config";

export type UploadKind = "agent-command" | "asset";

export type TransportTarget =
  | { type: "new-session" }
  | { type: "session"; sessionId: string };

export type UploadMeta = {
  id: string;
  kind: UploadKind;
  encoding: BrowserCompression;
  originalBytes: number;
  compressedBytes: number;
  sha256: string;
  createdAt: number;
  expiresAt: number;
  committed: boolean;
  total?: number;
  target?: TransportTarget;
  mimeType?: string;
  fileName?: string;
};

export type UploadedImage = {
  type: "image";
  data: string;
  mimeType: string;
};

export type UploadedFile = {
  type: "file";
  name: string;
  mimeType: string;
  text: string;
};

export const IMAGE_MIME_ALLOWLIST = new Set(["image/png", "image/jpeg", "image/webp"]);

function rootForKind(kind: UploadKind): string {
  return join(getUploadRoot(), kind === "asset" ? "assets" : "transport");
}

function uploadDir(kind: UploadKind, id: string): string {
  assertUploadId(kind, id);
  return join(rootForKind(kind), id);
}

function metaPath(kind: UploadKind, id: string): string {
  return join(uploadDir(kind, id), "meta.json");
}

function chunksDir(kind: UploadKind, id: string): string {
  return join(uploadDir(kind, id), "chunks");
}

function bodyPath(kind: UploadKind, id: string): string {
  return join(uploadDir(kind, id), "body.bin");
}

function chunkPath(kind: UploadKind, id: string, index: number): string {
  return join(chunksDir(kind, id), `${index}.chunk`);
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function assertUploadId(kind: UploadKind, id: string): void {
  const prefix = kind === "asset" ? "asset" : "up";
  if (!new RegExp(`^${prefix}_[a-f0-9]{32}$`).test(id)) {
    throw new Error("Invalid upload id");
  }
}

export function sha256Hex(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createUpload(meta: Omit<UploadMeta, "id" | "createdAt" | "committed"> & { id?: string }): UploadMeta {
  const id = meta.id ?? createId(meta.kind === "asset" ? "asset" : "up");
  const uploadMeta: UploadMeta = {
    ...meta,
    id,
    createdAt: Date.now(),
    committed: false,
  };
  mkdirSync(chunksDir(uploadMeta.kind, id), { recursive: true });
  writeFileSync(metaPath(uploadMeta.kind, id), JSON.stringify(uploadMeta, null, 2), "utf8");
  return uploadMeta;
}

export function readUploadMeta(kind: UploadKind, id: string): UploadMeta {
  const path = metaPath(kind, id);
  if (!existsSync(path)) throw new Error("Upload not found");
  const meta = JSON.parse(readFileSync(path, "utf8")) as UploadMeta;
  if (meta.expiresAt <= Date.now()) {
    deleteUpload(kind, id);
    throw new Error("Upload expired");
  }
  return meta;
}

function writeUploadMeta(meta: UploadMeta): void {
  writeFileSync(metaPath(meta.kind, meta.id), JSON.stringify(meta, null, 2), "utf8");
}

export function writeUploadChunk(
  kind: UploadKind,
  id: string,
  input: { index: unknown; total: unknown; data: unknown; sha256: unknown },
  maxChunkBytes: number,
): { index: number } {
  const meta = readUploadMeta(kind, id);
  if (meta.committed) throw new Error("Upload already committed");
  const index = Number(input.index);
  const total = Number(input.total);
  if (!Number.isInteger(index) || !Number.isInteger(total) || total <= 0 || index < 0 || index >= total) {
    throw new Error("Invalid chunk index");
  }
  if (typeof input.data !== "string" || typeof input.sha256 !== "string") {
    throw new Error("Chunk data and sha256 are required");
  }
  const bytes = Buffer.from(input.data, "base64url");
  if (bytes.length > maxChunkBytes) throw new Error("Chunk too large");
  if (sha256Hex(bytes) !== input.sha256) throw new Error("Chunk hash mismatch");
  writeFileSync(chunkPath(kind, id, index), bytes);
  return { index };
}

export function commitUpload(
  kind: UploadKind,
  id: string,
  input: { total: unknown; compressedBytes?: unknown; sha256: unknown },
): UploadMeta {
  const meta = readUploadMeta(kind, id);
  if (meta.committed) return meta;
  const total = Number(input.total);
  if (!Number.isInteger(total) || total <= 0) throw new Error("Invalid chunk total");
  if (typeof input.sha256 !== "string") throw new Error("Full sha256 is required");

  const chunks: Buffer[] = [];
  for (let i = 0; i < total; i += 1) {
    const path = chunkPath(kind, id, i);
    if (!existsSync(path)) throw new Error(`Missing chunk ${i}`);
    chunks.push(readFileSync(path));
  }
  const body = Buffer.concat(chunks);
  const expectedBytes = Number(input.compressedBytes ?? meta.compressedBytes);
  if (Number.isFinite(expectedBytes) && expectedBytes >= 0 && body.length !== expectedBytes) {
    throw new Error("Upload length mismatch");
  }
  if (sha256Hex(body) !== input.sha256 || input.sha256 !== meta.sha256) {
    throw new Error("Upload hash mismatch");
  }

  writeFileSync(bodyPath(kind, id), body);
  const committed = { ...meta, committed: true, total };
  writeUploadMeta(committed);
  return committed;
}

export function readCommittedPayload(kind: UploadKind, id: string): { meta: UploadMeta; bytes: Buffer } {
  const meta = readUploadMeta(kind, id);
  if (!meta.committed) throw new Error("Upload is not committed");
  const path = bodyPath(kind, id);
  if (!existsSync(path)) throw new Error("Committed upload body missing");
  return { meta, bytes: readFileSync(path) };
}

export function readDecodedCommandPayload(id: string): { meta: UploadMeta; text: string } {
  const { meta, bytes } = readCommittedPayload("agent-command", id);
  const decoded = meta.encoding === "gzip" ? gunzipSync(bytes) : bytes;
  if (decoded.length !== meta.originalBytes) throw new Error("Decoded upload length mismatch");
  return { meta, text: decoded.toString("utf8") };
}

export function readAssetAsImage(assetId: string): UploadedImage {
  const { meta, bytes } = readCommittedPayload("asset", assetId);
  if (!meta.mimeType || !IMAGE_MIME_ALLOWLIST.has(meta.mimeType)) throw new Error("Asset MIME type is not allowed");
  return {
    type: "image",
    data: bytes.toString("base64"),
    mimeType: meta.mimeType,
  };
}

export function readAssetAsText(assetId: string): UploadedFile {
  const { meta, bytes } = readCommittedPayload("asset", assetId);
  // Text/code assets are validated for size and type at creation time; here we
  // simply UTF-8 decode the stored bytes for injection into the prompt.
  return {
    type: "file",
    name: meta.fileName ?? "attachment.txt",
    mimeType: meta.mimeType ?? "text/plain",
    text: bytes.toString("utf8"),
  };
}

export function deleteUpload(kind: UploadKind, id: string): void {
  rmSync(uploadDir(kind, id), { recursive: true, force: true });
}
