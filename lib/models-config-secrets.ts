export const MASKED_MODEL_SECRET = "__PI_WEB_MASKED_SECRET__";

const SECRET_FIELD_RE = /^(apiKey|api_key|accessToken|access_token|authToken|auth_token|bearerToken|bearer_token|password|secret|token)$/i;
const SECRET_HEADER_RE = /^(authorization|proxy-authorization|x-api-key|api-key)$|api[-_]?key|token|secret/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSecretKey(key: string, parentKey?: string): boolean {
  if (parentKey === "headers") return SECRET_HEADER_RE.test(key);
  return SECRET_FIELD_RE.test(key);
}

export function maskModelSecrets(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => maskModelSecrets(item, parentKey));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      if (isSecretKey(key, parentKey) && typeof nested === "string" && nested.trim()) {
        return [key, MASKED_MODEL_SECRET];
      }
      return [key, maskModelSecrets(nested, key)];
    }),
  );
}

export function mergeMaskedModelSecrets(incoming: unknown, existing: unknown): unknown {
  if (incoming === MASKED_MODEL_SECRET) return existing;
  if (Array.isArray(incoming)) {
    const existingItems = Array.isArray(existing) ? existing : [];
    return incoming.map((item, index) => mergeMaskedModelSecrets(item, existingItems[index]));
  }
  if (!isRecord(incoming)) return incoming;

  const existingRecord = isRecord(existing) ? existing : {};
  return Object.fromEntries(
    Object.entries(incoming).map(([key, nested]) => [
      key,
      mergeMaskedModelSecrets(nested, existingRecord[key]),
    ]),
  );
}
