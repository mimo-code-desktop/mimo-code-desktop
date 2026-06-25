import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Auth } from "@/auth"
import { Config } from "@/config"
import { Provider } from "@/provider"
import { ModelsDev } from "@/provider"
import { ProviderAuth } from "@/provider"
import { ProviderID } from "@/provider/schema"
import { mapValues } from "remeda"
import { errors } from "../../error"
import { lazy } from "@/util/lazy"
import { Effect } from "effect"
import { jsonRequest } from "./trace"

const ProviderTestInput = z.object({
  providerID: ProviderID.zod,
  modelID: z.string(),
  apiKey: z.string().optional(),
  openaiURL: z.string().optional(),
  anthropicURL: z.string().optional(),
})

const ProviderTestResult = z.object({
  agents: z.array(
    z.object({
      agent: z.enum(["claude_code", "codex", "mimo", "opencode"]),
      ok: z.boolean(),
      status: z.number().optional(),
      message: z.string(),
    }),
  ),
})

type AgentID = "claude_code" | "codex" | "mimo" | "opencode"
type AgentResult = {
  agent: AgentID
  ok: boolean
  status?: number
  message: string
}

const MOONSHOT_MODELS: Record<string, ModelsDev.Model> = {
  "kimi-k2.7-code-highspeed": {
    id: "kimi-k2.7-code-highspeed",
    name: "Kimi K2.7 Code Highspeed",
    attachment: false,
    reasoning: true,
    tool_call: true,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    release_date: "2026-06-16",
    modalities: {
      input: ["text"],
      output: ["text"],
    },
    limit: {
      context: 262_144,
      output: 262_144,
    },
  },
  "kimi-k2.7-code": {
    id: "kimi-k2.7-code",
    name: "Kimi K2.7 Code",
    attachment: false,
    reasoning: true,
    tool_call: true,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    release_date: "2026-06-16",
    modalities: {
      input: ["text"],
      output: ["text"],
    },
    limit: {
      context: 262_144,
      output: 262_144,
    },
  },
}

function appendOpenAIPath(base: string, suffix: string) {
  const url = new URL(base)
  const path = url.pathname.replace(/\/+$/, "")
  if (path.endsWith(suffix)) return url.toString()
  if (path.endsWith("/v1")) {
    url.pathname = `${path}${suffix}`
    return url.toString()
  }
  url.pathname = `${path}/v1${suffix}`
  return url.toString()
}

function appendAnthropicPath(base: string) {
  const url = new URL(base)
  const path = url.pathname.replace(/\/+$/, "")
  if (path.endsWith("/messages")) return url.toString()
  url.pathname = path.endsWith("/v1") ? `${path}/messages` : `${path}/v1/messages`
  return url.toString()
}

async function readMessage(res: Response) {
  return (await res.text()).slice(0, 400) || res.statusText
}

async function testClaudeCode(modelID: string, key: string, url: string, thinking: boolean) {
  const res = await fetch(appendAnthropicPath(url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      Authorization: `Bearer ${key}`,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelID,
      max_tokens: 1,
      ...(thinking ? { thinking: { type: "enabled" } } : {}),
      messages: [{ role: "user", content: "ping" }],
    }),
    signal: AbortSignal.timeout(15_000),
  })
  return {
    agent: "claude_code" as const,
    ok: res.ok,
    status: res.status,
    message: res.ok ? "Connected" : await readMessage(res),
  }
}

async function testOpenAIResponses(agent: "codex", modelID: string, key: string, url: string) {
  const res = await fetch(appendOpenAIPath(url, "/responses"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: modelID,
      input: "ping",
      max_output_tokens: 1,
      store: false,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  return {
    agent,
    ok: res.ok,
    status: res.status,
    message: res.ok ? "Connected" : await readMessage(res),
  }
}

async function testOpenAIChat(agent: "codex" | "mimo" | "opencode", modelID: string, key: string, url: string) {
  const res = await fetch(appendOpenAIPath(url, "/chat/completions"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(agent === "mimo" ? { "X-Mimo-Source": "mimocode-desktop" } : {}),
    },
    body: JSON.stringify({
      model: modelID,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      stream: false,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  return {
    agent,
    ok: res.ok,
    status: res.status,
    message: res.ok ? "Connected" : await readMessage(res),
  }
}

function stringOption(value: unknown) {
  if (typeof value !== "string") return
  const trimmed = value.trim()
  if (!trimmed) return
  return trimmed
}

function optionUrls(value: unknown) {
  if (!value || typeof value !== "object") return {}
  const record = value as Record<string, unknown>
  return {
    openai: stringOption(record.openai),
    anthropic: stringOption(record.anthropic),
  }
}

async function settleAgent(agent: AgentID, input: Promise<AgentResult>): Promise<AgentResult> {
  return input.catch((err: unknown) => ({
    agent,
    ok: false,
    message: err instanceof Error ? err.message : String(err),
  }))
}

async function testAgents(
  input: z.infer<typeof ProviderTestInput>,
  model: Provider.Model,
  key: string,
  openaiURL: string | undefined,
  anthropicURL: string | undefined,
) {
  const useAnthropicThinking = Boolean(
    input.providerID === "moonshotai-cn" ||
      openaiURL?.includes("api.moonshot.") ||
      anthropicURL?.includes("api.moonshot."),
  )
  const useBridgeForCodex = Provider.codexBridgeRequired(model, openaiURL)
  const agents = await Promise.all(
    [
      anthropicURL
        ? settleAgent("claude_code", testClaudeCode(model.api.id, key, anthropicURL, useAnthropicThinking))
        : missingAgent("claude_code", "Anthropic URL is required"),
      openaiURL
        ? settleAgent(
            "codex",
            useBridgeForCodex
              ? testOpenAIChat("codex", model.api.id, key, openaiURL)
              : testOpenAIResponses("codex", model.api.id, key, openaiURL),
          )
        : missingAgent("codex", "OpenAI URL is required"),
      openaiURL
        ? settleAgent("mimo", testOpenAIChat("mimo", model.api.id, key, openaiURL))
        : missingAgent("mimo", "OpenAI URL is required"),
      openaiURL
        ? settleAgent("opencode", testOpenAIChat("opencode", model.api.id, key, openaiURL))
        : missingAgent("opencode", "OpenAI URL is required"),
    ],
  )
  return { agents }
}

function providerDefaults(input: {
  providerID: string
  modelID: string
  config: Config.Info
  provider?: Provider.Info
}) {
  const model = input.provider?.models[input.modelID]
  const modelUrls = optionUrls(model?.options.apiUrls)
  const configUrls = optionUrls(input.config.provider?.[input.providerID]?.options?.apiUrls)
  const configBaseURL = stringOption(input.config.provider?.[input.providerID]?.options?.baseURL)
  const providerBaseURL = stringOption(input.provider?.options.baseURL)
  const modelURL = stringOption(model?.api.url)
  const openaiURL = modelUrls.openai ?? configUrls.openai ?? configBaseURL ?? providerBaseURL ?? modelURL
  const anthropicURL =
    modelUrls.anthropic ??
    configUrls.anthropic ??
    (input.providerID === "anthropic" || model?.api.npm === "@ai-sdk/anthropic"
      ? (configBaseURL ?? providerBaseURL ?? modelURL)
      : undefined)
  return {
    openaiURL,
    anthropicURL,
  }
}

function missingAgent(agent: "claude_code" | "codex" | "mimo" | "opencode", message: string) {
  return {
    agent,
    ok: false,
    message,
  }
}

function missingKeyResult() {
  return {
    agents: [
      missingAgent("claude_code", "API key is required"),
      missingAgent("codex", "API key is required"),
      missingAgent("mimo", "API key is required"),
      missingAgent("opencode", "API key is required"),
    ],
  }
}

function missingModelResult(modelID: string) {
  return {
    agents: [
      missingAgent("claude_code", `Model ${modelID} was not found`),
      missingAgent("codex", `Model ${modelID} was not found`),
      missingAgent("mimo", `Model ${modelID} was not found`),
      missingAgent("opencode", `Model ${modelID} was not found`),
    ],
  }
}

function withMoonshotModels(providers: Record<string, Provider.Info>) {
  const moonshot = providers["moonshotai-cn"]
  if (!moonshot) return providers
  const patch = Provider.fromModelsDevProvider({
    id: "moonshotai-cn",
    name: moonshot.name,
    env: [],
    api: "https://api.moonshot.cn/v1",
    npm: "@ai-sdk/openai-compatible",
    models: MOONSHOT_MODELS,
  })
  return {
    ...providers,
    "moonshotai-cn": {
      ...moonshot,
      models: {
        ...moonshot.models,
        ...patch.models,
      },
    },
  }
}

export const ProviderRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List providers",
        description: "Get a list of all available AI providers, including both available and connected ones.",
        operationId: "provider.list",
        responses: {
          200: {
            description: "List of providers",
            content: {
              "application/json": {
                schema: resolver(Provider.ListResult.zod),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("ProviderRoutes.list", c, function* () {
          const svc = yield* Provider.Service
          const cfg = yield* Config.Service
          const config = yield* cfg.get()
          const all = yield* Effect.promise(() => ModelsDev.get())
          const disabled = new Set(config.disabled_providers ?? [])
          const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined
          const filtered: Record<string, (typeof all)[string]> = {}
          for (const [key, value] of Object.entries(all)) {
            if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) {
              filtered[key] = value
            }
          }
          const connected = yield* svc.list()
          const providers = Object.assign(
            mapValues(filtered, (x) => Provider.fromModelsDevProvider(x)),
            connected,
          )
          return {
            all: Object.values(providers),
            default: Provider.defaultModelIDs(providers),
            connected: Object.keys(connected),
          }
        }),
    )
    .get(
      "/auth",
      describeRoute({
        summary: "Get provider auth methods",
        description: "Retrieve available authentication methods for all AI providers.",
        operationId: "provider.auth",
        responses: {
          200: {
            description: "Provider auth methods",
            content: {
              "application/json": {
                schema: resolver(ProviderAuth.Methods.zod),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("ProviderRoutes.auth", c, function* () {
          const svc = yield* ProviderAuth.Service
          return yield* svc.methods()
        }),
    )
    .post(
      "/test",
      describeRoute({
        summary: "Test provider connectivity",
        description: "Test a provider model against Claude Code, Codex, MiMo, and OpenCode agent protocols.",
        operationId: "provider.test",
        responses: {
          200: {
            description: "Provider connectivity test result",
            content: {
              "application/json": {
                schema: resolver(ProviderTestResult),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", ProviderTestInput),
      async (c) =>
        jsonRequest("ProviderRoutes.test", c, function* () {
          const input = c.req.valid("json")
          const cfg = yield* Config.Service
          const auth = yield* Auth.Service
          const svc = yield* Provider.Service
          const config = yield* cfg.get()
          const providers = withMoonshotModels(
            Object.assign(
              mapValues(yield* Effect.promise(() => ModelsDev.get()), (item) => Provider.fromModelsDevProvider(item)),
              yield* svc.list(),
            ),
          )
          const provider = providers[input.providerID]
          const model = provider?.models[input.modelID]
          if (!model) return missingModelResult(input.modelID)
          const configuredProvider = config.provider?.[input.providerID]

          const apiKey =
            input.apiKey?.trim() ||
            (yield* auth
              .get(input.providerID)
              .pipe(Effect.map((value) => (value?.type === "api" ? value.key : undefined)))) ||
            (typeof configuredProvider?.options?.apiKey === "string" ? configuredProvider.options.apiKey : undefined) ||
            stringOption(provider.options.apiKey)
          if (!apiKey) return missingKeyResult()

          const defaults = providerDefaults({
            providerID: input.providerID,
            modelID: input.modelID,
            config,
            provider,
          })
          const openaiURL = input.openaiURL?.trim() || defaults.openaiURL
          const anthropicURL = input.anthropicURL?.trim() || defaults.anthropicURL

          return yield* Effect.promise(() => testAgents(input, model, apiKey, openaiURL, anthropicURL))
        }),
    )
    .post(
      "/:providerID/oauth/authorize",
      describeRoute({
        summary: "OAuth authorize",
        description: "Initiate OAuth authorization for a specific AI provider to get an authorization URL.",
        operationId: "provider.oauth.authorize",
        responses: {
          200: {
            description: "Authorization URL and method",
            content: {
              "application/json": {
                schema: resolver(ProviderAuth.Authorization.zod.optional()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      validator("json", ProviderAuth.AuthorizeInput.zod),
      async (c) =>
        jsonRequest("ProviderRoutes.oauth.authorize", c, function* () {
          const providerID = c.req.valid("param").providerID
          const { method, inputs } = c.req.valid("json")
          const svc = yield* ProviderAuth.Service
          return yield* svc.authorize({
            providerID,
            method,
            inputs,
          })
        }),
    )
    .post(
      "/:providerID/oauth/callback",
      describeRoute({
        summary: "OAuth callback",
        description: "Handle the OAuth callback from a provider after user authorization.",
        operationId: "provider.oauth.callback",
        responses: {
          200: {
            description: "OAuth callback processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      validator("json", ProviderAuth.CallbackInput.zod),
      async (c) =>
        jsonRequest("ProviderRoutes.oauth.callback", c, function* () {
          const providerID = c.req.valid("param").providerID
          const { method, code } = c.req.valid("json")
          const svc = yield* ProviderAuth.Service
          yield* svc.callback({
            providerID,
            method,
            code,
          })
          return true
        }),
    ),
)
