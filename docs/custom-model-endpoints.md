# Custom Model Endpoints

pi-web uses Pi's `models.json` parser and model registry. Custom model
endpoints are configured in the Pi agent directory:

```text
$PI_CODING_AGENT_DIR/models.json
```

The Models panel reads and writes the same file, masks stored secrets on read,
and can test a configured model through `POST /api/models-config/test`.

For advanced fields that are not exposed as form controls, edit
`models.json` directly; pi-web preserves unknown provider and model fields when
saving normal form edits.

## OpenAI-Compatible Endpoints

Use `api: "openai-completions"` for OpenAI Chat Completions-compatible
servers such as Ollama, LM Studio, vLLM, SGLang, OpenRouter, Vercel AI Gateway,
or an internal proxy.

```json
{
  "providers": {
    "local-openai-compatible": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "local-placeholder",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        {
          "id": "qwen2.5-coder:7b",
          "name": "Qwen Coder 7B Local",
          "contextWindow": 32768,
          "maxTokens": 8192
        }
      ]
    }
  }
}
```

Path behavior: Pi passes `baseUrl` to the OpenAI SDK. For
`openai-completions`, a `baseUrl` ending in `/v1` is called as:

```text
<baseUrl>/chat/completions
```

The model test smoke check verified this with:

```text
http://127.0.0.1:<port>/openai/v1/chat/completions
```

For keyless local servers, keep a placeholder `apiKey`; Pi treats custom
models as authenticated before listing them as available.

## Anthropic-Compatible Endpoints

Use `api: "anthropic-messages"` for Anthropic Messages-compatible endpoints or
proxies.

```json
{
  "providers": {
    "anthropic-proxy": {
      "baseUrl": "https://proxy.example.com",
      "api": "anthropic-messages",
      "apiKey": "$ANTHROPIC_PROXY_KEY",
      "compat": {
        "supportsEagerToolInputStreaming": false,
        "supportsLongCacheRetention": true,
        "forceAdaptiveThinking": true
      },
      "models": [
        {
          "id": "claude-opus-4-7",
          "name": "Claude Opus via Proxy",
          "reasoning": true,
          "input": ["text", "image"]
        }
      ]
    }
  }
}
```

Path behavior: Pi passes `baseUrl` to the Anthropic SDK. For
`anthropic-messages`, the SDK calls:

```text
<baseUrl>/v1/messages
```

The model test smoke check verified this with:

```text
http://127.0.0.1:<port>/anthropic/v1/messages
```

## Headers And Secrets

Provider-level fields supported by Pi include:

```json
{
  "apiKey": "$PROVIDER_API_KEY",
  "headers": {
    "x-provider-routing": "team-a"
  },
  "authHeader": true
}
```

- `apiKey` and `headers` support literals, `$ENV_VAR`, `${ENV_VAR}`, and
  leading `!command` values.
- `authHeader: true` adds `Authorization: Bearer <apiKey>` for providers that
  expect bearer auth outside standard SDK behavior.
- pi-web masks `apiKey` and sensitive headers when reading `models.json`.
- Saving a masked config preserves existing secret values.

## Compatibility Knobs

Common `openai-completions` compatibility options:

```json
{
  "compat": {
    "supportsDeveloperRole": false,
    "supportsReasoningEffort": false,
    "supportsUsageInStreaming": false,
    "maxTokensField": "max_tokens"
  }
}
```

Common `anthropic-messages` compatibility options:

```json
{
  "compat": {
    "supportsEagerToolInputStreaming": false,
    "supportsLongCacheRetention": true,
    "forceAdaptiveThinking": true,
    "allowEmptySignature": false
  }
}
```

You can set `compat` at provider level or model level. Model-level values
override provider-level defaults.

## Testing

Use the Models panel:

1. Add or select a custom provider.
2. Set `Base URL`, `API`, and `API Key`.
3. Add a model ID.
4. Click `Test` on the model detail pane.

The test endpoint sends a tiny prompt, uses the configured `baseUrl`, and
reports latency, HTTP status, and response text.

Phase 5 smoke verification covered:

- `openai-completions` custom `baseUrl` with a local mock streaming
  Chat Completions server.
- `anthropic-messages` custom `baseUrl` with a local mock streaming Messages
  server.
- `/api/models` listing custom providers from `models.json`.
- No runtime dependency on `bridge-relay-gateway`; the gateway is only a design
  reference for chunked browser transport.
