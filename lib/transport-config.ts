import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { getPiAgentDir } from "./server-config";

export type BrowserCompression = "identity" | "gzip";

export type TransportConfig = {
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

export const DEFAULT_TRANSPORT_CONFIG: TransportConfig = {
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

function numberFrom(input: unknown, fallback: number, min: number, max: number): number {
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function normalizeTransportConfig(input: unknown): TransportConfig {
  const raw = input && typeof input === "object"
    ? ("transport" in input && typeof (input as { transport?: unknown }).transport === "object"
      ? (input as { transport: unknown }).transport
      : input)
    : {};
  const config = raw as Partial<TransportConfig>;

  return {
    enabled: typeof config.enabled === "boolean" ? config.enabled : DEFAULT_TRANSPORT_CONFIG.enabled,
    thresholdBytes: numberFrom(config.thresholdBytes, DEFAULT_TRANSPORT_CONFIG.thresholdBytes, 512, 64 * 1024 * 1024),
    maxChunkBytes: numberFrom(config.maxChunkBytes, DEFAULT_TRANSPORT_CONFIG.maxChunkBytes, 128, 8 * 1024 * 1024),
    safetyMarginBytes: numberFrom(config.safetyMarginBytes, DEFAULT_TRANSPORT_CONFIG.safetyMarginBytes, 0, 1024 * 1024),
    compression: config.compression === "identity" ? "identity" : "gzip",
    parallelUploads: numberFrom(config.parallelUploads, DEFAULT_TRANSPORT_CONFIG.parallelUploads, 1, 8),
    retryMax: numberFrom(config.retryMax, DEFAULT_TRANSPORT_CONFIG.retryMax, 0, 10),
    sessionTtlSeconds: numberFrom(config.sessionTtlSeconds, DEFAULT_TRANSPORT_CONFIG.sessionTtlSeconds, 60, 24 * 60 * 60),
    assetMaxBytes: numberFrom(config.assetMaxBytes, DEFAULT_TRANSPORT_CONFIG.assetMaxBytes, 1024, 100 * 1024 * 1024),
    sseMaxEventBytes: numberFrom(config.sseMaxEventBytes, DEFAULT_TRANSPORT_CONFIG.sseMaxEventBytes, 1024, 1024 * 1024),
  };
}

export function getTransportConfigPath(): string {
  return join(getPiAgentDir(), "pi-web.transport.json");
}

export function readTransportConfig(): TransportConfig {
  const configPath = getTransportConfigPath();
  if (!existsSync(configPath)) return DEFAULT_TRANSPORT_CONFIG;
  try {
    return normalizeTransportConfig(JSON.parse(readFileSync(configPath, "utf8")));
  } catch {
    return DEFAULT_TRANSPORT_CONFIG;
  }
}

export function writeTransportConfig(config: TransportConfig): void {
  const normalized = normalizeTransportConfig(config);
  const configPath = getTransportConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ transport: normalized }, null, 2), "utf8");
}
