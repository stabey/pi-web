import { createHash } from "crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AuthStorage, getAgentDir, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { mergeMaskedModelSecrets } from "./models-config-secrets";

export type DiscoveredModel = {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: ("text" | "image")[];
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
};

export type ModelDiscoveryResult = {
  sourceUrl: string;
  models: DiscoveredModel[];
  warning?: string;
};

export type CachedModelDiscoveryResult = ModelDiscoveryResult & {
  providerName: string;
  cacheKey: string;
  fetchedAt: string;
};

const DISCOVERY_TIMEOUT_MS = 20_000;
const DISCOVERY_CACHE_VERSION = 1;
const DISCOVERY_CACHE_FILE = "model-discovery-cache.json";

type DiscoveryCacheFile = {
  version: typeof DISCOVERY_CACHE_VERSION;
  providers: Record<string, CachedModelDiscoveryResult>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function readExistingProvider(providerName: string): Record<string, unknown> | undefined {
  const modelsPath = join(getAgentDir(), "models.json");
  if (!existsSync(modelsPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(modelsPath, "utf8")) as { providers?: unknown };
    if (!isRecord(parsed.providers)) return undefined;
    const provider = parsed.providers[providerName];
    return isRecord(provider) ? provider : undefined;
  } catch {
    return undefined;
  }
}

function getDiscoveryCachePath(): string {
  return join(getAgentDir(), DISCOVERY_CACHE_FILE);
}

function readDiscoveryCacheFile(): DiscoveryCacheFile {
  const path = getDiscoveryCachePath();
  if (!existsSync(path)) return { version: DISCOVERY_CACHE_VERSION, providers: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<DiscoveryCacheFile>;
    if (parsed.version !== DISCOVERY_CACHE_VERSION || !isRecord(parsed.providers)) {
      return { version: DISCOVERY_CACHE_VERSION, providers: {} };
    }
    return {
      version: DISCOVERY_CACHE_VERSION,
      providers: parsed.providers as Record<string, CachedModelDiscoveryResult>,
    };
  } catch {
    return { version: DISCOVERY_CACHE_VERSION, providers: {} };
  }
}

function writeDiscoveryCacheFile(cache: DiscoveryCacheFile): void {
  const agentDir = getAgentDir();
  if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });
  writeFileSync(getDiscoveryCachePath(), JSON.stringify(cache, null, 2), "utf8");
}

function getProviderCacheKey(providerName: string, provider: Record<string, unknown>): string {
  const headers = isRecord(provider.headers) ? Object.keys(provider.headers).sort() : [];
  const fingerprint = {
    providerName,
    baseUrl: asString(provider.baseUrl) ?? "",
    api: asString(provider.api) ?? "openai-completions",
    headers,
  };
  return createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex");
}

function mergeProviderInput(providerName: string, providerInput: Record<string, unknown>): Record<string, unknown> {
  const existingProvider = readExistingProvider(providerName);
  return mergeMaskedModelSecrets(providerInput, existingProvider) as Record<string, unknown>;
}

export function readCachedProviderModels(providerName: string, providerInput: Record<string, unknown>): CachedModelDiscoveryResult | null {
  const provider = mergeProviderInput(providerName, providerInput);
  const cacheKey = getProviderCacheKey(providerName, provider);
  const cached = readDiscoveryCacheFile().providers[providerName];
  if (!cached || cached.cacheKey !== cacheKey) return null;
  return cached;
}

export function writeCachedProviderModels(
  providerName: string,
  providerInput: Record<string, unknown>,
  result: ModelDiscoveryResult,
): CachedModelDiscoveryResult {
  const provider = mergeProviderInput(providerName, providerInput);
  const cache = readDiscoveryCacheFile();
  const cached: CachedModelDiscoveryResult = {
    ...result,
    providerName,
    cacheKey: getProviderCacheKey(providerName, provider),
    fetchedAt: new Date().toISOString(),
  };
  cache.providers[providerName] = cached;
  writeDiscoveryCacheFile(cache);
  return cached;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function getFirstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value !== undefined) return Math.round(value);
  }
  return undefined;
}

function buildModelsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const stripped = url.pathname
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/responses$/i, "")
    .replace(/\/messages$/i, "");
  url.pathname = `${stripped || ""}/models`;
  url.search = "";
  return url.toString();
}

function extractModelItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.models)) return payload.models;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function inferReasoning(item: Record<string, unknown>): boolean | undefined {
  const direct = asBoolean(item.reasoning)
    ?? asBoolean(item.supports_reasoning)
    ?? asBoolean(item.supportsReasoning)
    ?? asBoolean(item.reasoning_supported);
  if (direct !== undefined) return direct;

  const capabilities = getNestedRecord(item, "capabilities");
  if (capabilities) {
    const capabilityReasoning = asBoolean(capabilities.reasoning)
      ?? asBoolean(capabilities.thinking)
      ?? asBoolean(capabilities.supports_reasoning);
    if (capabilityReasoning !== undefined) return capabilityReasoning;
  }

  const supportedParameters = getStringArray(item.supported_parameters ?? item.supportedParameters);
  if (supportedParameters.some((param) => param === "reasoning" || param === "reasoning_effort" || param === "thinking")) {
    return true;
  }

  return undefined;
}

function inferInput(item: Record<string, unknown>): ("text" | "image")[] | undefined {
  const inputs = [
    ...getStringArray(item.input_modalities),
    ...getStringArray(item.inputModalities),
    ...getStringArray(item.modalities),
  ];
  const architecture = getNestedRecord(item, "architecture");
  if (architecture) {
    inputs.push(...getStringArray(architecture.input_modalities));
    inputs.push(...getStringArray(architecture.inputModalities));
    inputs.push(...getStringArray(architecture.modality));
  }
  const lower = inputs.map((value) => value.toLowerCase());
  if (lower.some((value) => value.includes("image") || value.includes("vision"))) return ["text", "image"];
  return undefined;
}

function inferCost(item: Record<string, unknown>): DiscoveredModel["cost"] | undefined {
  const pricing = getNestedRecord(item, "pricing") ?? getNestedRecord(item, "cost");
  if (!pricing) return undefined;

  const perMillion = (value: unknown) => {
    const n = asNumber(value);
    return n === undefined ? undefined : n * 1_000_000;
  };

  const cost = {
    input: perMillion(pricing.prompt ?? pricing.input),
    output: perMillion(pricing.completion ?? pricing.output),
    cacheRead: perMillion(pricing.cache_read ?? pricing.cacheRead),
    cacheWrite: perMillion(pricing.cache_write ?? pricing.cacheWrite),
  };

  return Object.values(cost).some((value) => value !== undefined) ? cost : undefined;
}

function normalizeModel(item: unknown): DiscoveredModel | null {
  if (!isRecord(item)) return null;
  const id = asString(item.id ?? item.name ?? item.model);
  if (!id) return null;

  const displayName = asString(item.display_name ?? item.displayName ?? item.name);
  const contextWindow = getFirstNumber(item, [
    "contextWindow",
    "context_window",
    "context_length",
    "contextLength",
    "max_context_length",
    "maxContextLength",
    "max_input_tokens",
    "maxInputTokens",
  ]);
  const maxTokens = getFirstNumber(item, [
    "maxTokens",
    "max_tokens",
    "max_output_tokens",
    "maxOutputTokens",
    "output_token_limit",
    "max_completion_tokens",
  ]);

  const normalized: DiscoveredModel = {
    id,
    name: displayName && displayName !== id ? displayName : undefined,
    contextWindow,
    maxTokens,
    reasoning: inferReasoning(item),
    input: inferInput(item),
    cost: inferCost(item),
  };

  return normalized;
}

function modelSort(a: DiscoveredModel, b: DiscoveredModel): number {
  return (a.name ?? a.id).localeCompare(b.name ?? b.id, undefined, { numeric: true, sensitivity: "base" })
    || a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" });
}

async function resolveProviderAuth(providerName: string, provider: Record<string, unknown>): Promise<{ apiKey?: string; headers?: Record<string, string> }> {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-web-model-discovery-"));
  try {
    const modelsPath = join(tempDir, "models.json");
    writeFileSync(modelsPath, JSON.stringify({
      providers: {
        [providerName]: {
          ...provider,
          models: [{
            id: "__pi_web_model_discovery__",
            api: asString(provider.api) ?? "openai-completions",
            contextWindow: 128000,
            maxTokens: 1024,
          }],
        },
      },
    }), "utf8");

    const registry = ModelRegistry.create(AuthStorage.create(), modelsPath);
    const model = registry.find(providerName, "__pi_web_model_discovery__");
    if (!model) return {};
    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok) throw new Error(auth.error);
    return { apiKey: auth.apiKey, headers: auth.headers };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function discoverProviderModels(providerName: string, providerInput: Record<string, unknown>): Promise<ModelDiscoveryResult> {
  const provider = mergeProviderInput(providerName, providerInput);
  const baseUrl = asString(provider.baseUrl);
  if (!baseUrl) throw new Error("Base URL is required before fetching models");

  const sourceUrl = buildModelsUrl(baseUrl);
  const api = asString(provider.api) ?? "openai-completions";
  const auth = await resolveProviderAuth(providerName, provider);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(auth.headers ?? {}),
  };

  if (auth.apiKey) {
    const hasAuthHeader = Object.keys(headers).some((key) => key.toLowerCase() === "authorization");
    const hasAnthropicKey = Object.keys(headers).some((key) => key.toLowerCase() === "x-api-key");
    if (api === "anthropic-messages") {
      if (!hasAnthropicKey) headers["x-api-key"] = auth.apiKey;
      if (!headers["anthropic-version"] && !headers["Anthropic-Version"]) headers["anthropic-version"] = "2023-06-01";
    } else if (!hasAuthHeader) {
      headers.Authorization = `Bearer ${auth.apiKey}`;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetch(sourceUrl, { headers, signal: controller.signal });
    const text = await res.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }

    if (!res.ok) {
      const message = isRecord(payload)
        ? asString(payload.error)
          ?? (isRecord(payload.error) ? asString(payload.error.message) : undefined)
          ?? asString(payload.message)
        : undefined;
      throw new Error(message ?? `Model discovery failed with HTTP ${res.status}`);
    }

    const seen = new Set<string>();
    const models = extractModelItems(payload)
      .map(normalizeModel)
      .filter((model): model is DiscoveredModel => !!model)
      .filter((model) => {
        if (seen.has(model.id)) return false;
        seen.add(model.id);
        return true;
      })
      .sort(modelSort);

    return {
      sourceUrl,
      models,
      warning: models.length === 0 ? "The provider responded, but no model entries were found." : undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Model discovery timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
