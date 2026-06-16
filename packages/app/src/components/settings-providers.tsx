import type { Model, ProviderTestResponses } from "@mimo-ai/sdk/v2/client"
import { DateTime } from "luxon"
import { Button } from "@mimo-ai/ui/button"
import { useDialog } from "@mimo-ai/ui/context/dialog"
import { IconButton } from "@mimo-ai/ui/icon-button"
import { Icon } from "@mimo-ai/ui/icon"
import { ProviderIcon } from "@mimo-ai/ui/provider-icon"
import { Tag } from "@mimo-ai/ui/tag"
import { TextField } from "@mimo-ai/ui/text-field"
import { Switch } from "@mimo-ai/ui/switch"
import { Tooltip } from "@mimo-ai/ui/tooltip"
import { showToast } from "@mimo-ai/ui/toast"
import { useParams } from "@solidjs/router"
import { batch, createEffect, createMemo, createSignal, For, Show, onCleanup } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Link } from "@/components/link"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { decode64 } from "@/utils/base64"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { type FormState, headerRow, modelRow, validateCustomProvider } from "./dialog-custom-provider-form"

type ProviderSource = "env" | "api" | "config" | "custom"
type ProviderItem = ReturnType<ReturnType<typeof useProviders>["all"]>[number]
type FormRow = {
  apiKey?: string
  openaiURL?: string
  anthropicURL?: string
  saving?: boolean
  disconnecting?: boolean
}
type AgentResult = ProviderTestResponses[200]["agents"][number]
type ModelTestState = {
  state: "idle" | "testing" | "complete"
  agents?: AgentResult[]
}
type ModelsDevProvider = {
  id: string
  name: string
  models: Record<
    string,
    {
      id: string
      name?: string
      release_date?: string
      status?: "alpha" | "beta" | "deprecated"
      limit?: {
        context?: number
        input?: number
        output?: number
      }
      modalities?: {
        input?: string[]
        output?: string[]
      }
    }
  >
}

const moonshotModels: ModelsDevProvider["models"] = {
  "kimi-k2.7-code": {
    id: "kimi-k2.7-code",
    name: "Kimi K2.7 Code",
    release_date: "2026-06-16",
    limit: {
      context: 262_144,
      output: 262_144,
    },
    modalities: {
      input: ["text"],
      output: ["text"],
    },
  },
  "kimi-k2.7-code-highspeed": {
    id: "kimi-k2.7-code-highspeed",
    name: "Kimi K2.7 Code Highspeed",
    release_date: "2026-06-16",
    limit: {
      context: 262_144,
      output: 262_144,
    },
    modalities: {
      input: ["text"],
      output: ["text"],
    },
  },
}

const providerOrder = [
  "mimo",
  "xiaomi",
  "deepseek",
  "zhipuai",
  "bigmodel",
  "zai",
  "moonshotai-cn",
  "minimax",
  "alibaba-cn",
  "alibaba",
  "anthropic",
  "github-copilot",
  "openai",
  "google",
  "openrouter",
  "vercel",
  "opencode",
]
const priority = [...new Set([...providerOrder, ...popularProviders])]
const agentLabels: Record<AgentResult["agent"], string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  mimo: "MiMo",
  opencode: "OpenCode",
}
const builtinProviderUrls: Record<string, { openai?: string; anthropic?: string }> = {
  anthropic: { anthropic: "https://api.anthropic.com" },
  openai: { openai: "https://api.openai.com/v1" },
  deepseek: { openai: "https://api.deepseek.com", anthropic: "https://api.deepseek.com/anthropic" },
  "moonshotai-cn": { openai: "https://api.moonshot.cn/v1", anthropic: "https://api.moonshot.cn/anthropic" },
  "kimi-for-coding": { openai: "https://api.kimi.com/coding/v1", anthropic: "https://api.kimi.com/coding/v1" },
  minimax: { openai: "https://api.minimax.com/v1", anthropic: "https://api.minimax.com/anthropic" },
  mimo: { openai: "https://api.xiaomimimo.com/v1", anthropic: "https://api.xiaomimimo.com/anthropic" },
  xiaomi: { openai: "https://api.xiaomimimo.com/v1", anthropic: "https://api.xiaomimimo.com/anthropic" },
  "xiaomi-token-plan-sgp": {
    openai: "https://token-plan-sgp.xiaomimimo.com/v1",
    anthropic: "https://token-plan-sgp.xiaomimimo.com/anthropic",
  },
  openrouter: {
    openai: "https://openrouter.ai/api/v1",
    anthropic: "https://openrouter.ai/api/v1/chat/completions",
  },
  zhipuai: { openai: "https://open.bigmodel.cn/api/paas/v4" },
  "alibaba-cn": { openai: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  alibaba: { openai: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
}

function cleanURL(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return
  const duplicate = trimmed.search(/https?:\/\//)
  if (duplicate === -1) return trimmed
  const next = trimmed.slice(duplicate + 1).search(/https?:\/\//)
  if (next === -1) return trimmed
  return trimmed.slice(next + duplicate + 1)
}

function apiUrls(value: unknown) {
  if (!value || typeof value !== "object") return {}
  const record = value as Record<string, unknown>
  return {
    openai: typeof record.openai === "string" ? cleanURL(record.openai) : undefined,
    anthropic: typeof record.anthropic === "string" ? cleanURL(record.anthropic) : undefined,
  }
}

function stringOption(value: unknown) {
  if (typeof value !== "string") return
  return cleanURL(value)
}

function parseModelOrder(value: unknown) {
  if (!value) return []
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function anthropicEndpointFromOpenAIURL(value: string | undefined) {
  const url = cleanURL(value)
  if (!url) return
  const trimmed = url.replace(/\/+$/, "")
  if (trimmed.endsWith("/anthropic")) return trimmed
  if (trimmed.endsWith("/v1")) return `${trimmed.slice(0, -3)}/anthropic`
  return `${trimmed}/anthropic`
}

function duplicateDefaultProvider(id: string, ids: Set<string>, keep: Set<string>) {
  if (keep.has(id)) return false
  if (id === "kimi-for-coding") return ids.has("moonshotai-cn")
  if (id === "zai" || id === "bigmodel") return ids.has("zhipuai")
  if (id === "alibaba") return ids.has("alibaba-cn")
  return false
}

function obsoleteModel(id: string) {
  return /^mimo-v2(?:-|$)/.test(id)
}

function latestModels(item: ProviderItem, providers: Record<string, ModelsDevProvider>) {
  const latest = providers[item.id]?.models ?? {}
  const urls = apiUrls(item.options.apiUrls)
  const moonshot =
    item.id.includes("moonshot") ||
    urls.openai?.includes("api.moonshot.") ||
    urls.anthropic?.includes("api.moonshot.") ||
    stringOption(item.options.baseURL)?.includes("api.moonshot.")
  if (!moonshot) return latest
  return {
    ...latest,
    ...moonshotModels,
  }
}

export const SettingsProviders = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const providers = useProviders()
  const params = useParams()
  const [showProviderKey, setShowProviderKey] = createSignal(false)
  const [showCustomKey, setShowCustomKey] = createSignal(false)
  let scrollArea: HTMLDivElement | undefined
  let providerApiKeyInput: HTMLInputElement | undefined
  let providerOpenAIURLInput: HTMLInputElement | undefined
  let providerAnthropicURLInput: HTMLInputElement | undefined
  const [modelsDev, setModelsDev] = createStore<{
    loading: boolean
    providers: Record<string, ModelsDevProvider>
  }>({
    loading: true,
    providers: {},
  })
  const [store, setStore] = createStore<{
    mode: "provider" | "custom"
    selectedProviderID?: string
    form: Record<string, FormRow>
    tests: Record<string, ModelTestState>
    newModel: Record<string, { id?: string; error?: string }>
    addingModel: Record<string, boolean>
    modelFilter: Record<string, string>
    modelRefresh: number
    customSaving: boolean
    custom: FormState
  }>({
    mode: "provider",
    form: {},
    tests: {},
    newModel: {},
    addingModel: {},
    modelFilter: {},
    modelRefresh: 0,
    customSaving: false,
    custom: {
      providerID: "",
      name: "",
      baseURL: "",
      apiKey: "",
      models: [modelRow()],
      headers: [headerRow()],
      err: {},
    },
  })

  const source = (item: ProviderItem): ProviderSource | undefined => {
    if (!("source" in item)) return
    const value = item.source
    if (value === "env" || value === "api" || value === "config" || value === "custom") return value
    return
  }

  const directory = createMemo(() => decode64(params.dir) ?? undefined)
  const configured = createMemo(() => new Set(Object.keys(globalSync.data.config.provider ?? {})))
  const connected = createMemo(() => new Set(globalSync.data.provider.connected))
  createEffect(() => {
    store.modelRefresh
    const controller = new AbortController()
    setModelsDev("loading", true)
    void fetch("https://models.dev/api.json", {
      signal: controller.signal,
    })
      .then((result) => (result.ok ? result.json() : undefined))
      .then((result: unknown) => {
        if (!result || typeof result !== "object") return
        setModelsDev("providers", result as Record<string, ModelsDevProvider>)
      })
      .finally(() => setModelsDev("loading", false))
    onCleanup(() => controller.abort())
  })

  const rows = createMemo(() => {
    const byID = new Map(providers.all().map((item) => [item.id, item]))
    const ids = new Set([...priority, ...connected(), ...configured()])
    const keep = new Set([...connected(), ...configured()])
    return [...ids]
      .map((id) => {
        const item = byID.get(id)
        if (item) return item
        const config = globalSync.data.config.provider?.[id]
        if (!config) return
        return {
          id,
          name: config.name ?? id,
          source: "config",
          env: [],
          options: config.options ?? {},
          models: {},
        } as ProviderItem
      })
      .filter((item): item is ProviderItem => !!item)
      .filter((item) => !duplicateDefaultProvider(item.id, ids, keep))
      .sort((a, b) => {
        const ai = providerOrder.indexOf(a.id)
        const bi = providerOrder.indexOf(b.id)
        if (ai >= 0 && bi >= 0) return ai - bi
        if (ai >= 0) return -1
        if (bi >= 0) return 1
        return a.name.localeCompare(b.name)
      })
  })
  const selected = createMemo(() => {
    if (store.mode === "custom") return
    return rows().find((item) => item.id === store.selectedProviderID) ?? rows()[0]
  })
  const providerSections = createMemo(() => {
    return [
      {
        id: "custom",
        title: language.t("settings.providers.section.customProviders"),
        items: rows(),
      },
    ].filter((section) => section.items.length > 0)
  })
  const models = createMemo(() => {
    const item = selected()
    if (!item) return []
    const configuredModels = globalSync.data.config.provider?.[item.id]?.models ?? {}
    const latest = latestModels(item, modelsDev.providers)
    const hasLatest = Object.keys(latest).length > 0
    const order = parseModelOrder(globalSync.data.config.provider?.[item.id]?.options?.modelOrder)
    const orderIndex = new Map(order.map((id, index) => [id, index] as const))
    const rows = new Map<string, Model>()
    if (!hasLatest) {
      Object.values(item.models).forEach((model) => rows.set(model.id, model))
    }
    Object.entries(latest).forEach(([modelID, model]) => {
      const configured = configuredModels[modelID]
      rows.set(modelID, {
        id: modelID,
        providerID: item.id,
        api: {
          id: configured?.id ?? model.id,
          url: configured?.provider?.api ?? "",
          npm: configured?.provider?.npm ?? "",
        },
        name: model.name ?? configured?.name ?? modelID,
        capabilities: {
          temperature: configured?.temperature ?? false,
          reasoning: configured?.reasoning ?? false,
          attachment: configured?.attachment ?? model.modalities?.input?.includes("image") ?? false,
          toolcall: configured?.tool_call ?? true,
          input: {
            text: configured?.modalities?.input?.includes("text") ?? model.modalities?.input?.includes("text") ?? true,
            audio:
              configured?.modalities?.input?.includes("audio") ?? model.modalities?.input?.includes("audio") ?? false,
            image:
              configured?.modalities?.input?.includes("image") ?? model.modalities?.input?.includes("image") ?? false,
            video:
              configured?.modalities?.input?.includes("video") ?? model.modalities?.input?.includes("video") ?? false,
            pdf: configured?.modalities?.input?.includes("pdf") ?? model.modalities?.input?.includes("pdf") ?? false,
          },
          output: {
            text:
              configured?.modalities?.output?.includes("text") ?? model.modalities?.output?.includes("text") ?? true,
            audio:
              configured?.modalities?.output?.includes("audio") ?? model.modalities?.output?.includes("audio") ?? false,
            image:
              configured?.modalities?.output?.includes("image") ?? model.modalities?.output?.includes("image") ?? false,
            video:
              configured?.modalities?.output?.includes("video") ?? model.modalities?.output?.includes("video") ?? false,
            pdf: configured?.modalities?.output?.includes("pdf") ?? model.modalities?.output?.includes("pdf") ?? false,
          },
          interleaved: configured?.interleaved ?? false,
        },
        cost: {
          input: configured?.cost?.input ?? 0,
          output: configured?.cost?.output ?? 0,
          cache: {
            read: configured?.cost?.cache_read ?? 0,
            write: configured?.cost?.cache_write ?? 0,
          },
        },
        limit: {
          context: configured?.limit?.context ?? model.limit?.context ?? 0,
          input: configured?.limit?.input ?? model.limit?.input,
          output: configured?.limit?.output ?? model.limit?.output ?? 0,
        },
        status: model.status ?? configured?.status ?? "active",
        options: configured?.options ?? {},
        headers: configured?.headers ?? {},
        release_date: model.release_date ?? configured?.release_date ?? "",
        variants: configured?.variants,
      })
    })
    Object.entries(configuredModels).forEach(([modelID, model]) => {
      if (rows.has(modelID)) return
      rows.set(modelID, {
        id: modelID,
        providerID: item.id,
        api: { id: model.id ?? modelID, url: "", npm: model.provider?.npm ?? "" },
        name: model.name ?? modelID,
        capabilities: {
          temperature: model.temperature ?? false,
          reasoning: model.reasoning ?? false,
          attachment: model.attachment ?? false,
          toolcall: model.tool_call ?? true,
          input: {
            text: model.modalities?.input?.includes("text") ?? true,
            audio: model.modalities?.input?.includes("audio") ?? false,
            image: model.modalities?.input?.includes("image") ?? false,
            video: model.modalities?.input?.includes("video") ?? false,
            pdf: model.modalities?.input?.includes("pdf") ?? false,
          },
          output: {
            text: model.modalities?.output?.includes("text") ?? true,
            audio: model.modalities?.output?.includes("audio") ?? false,
            image: model.modalities?.output?.includes("image") ?? false,
            video: model.modalities?.output?.includes("video") ?? false,
            pdf: model.modalities?.output?.includes("pdf") ?? false,
          },
          interleaved: model.interleaved ?? false,
        },
        cost: {
          input: model.cost?.input ?? 0,
          output: model.cost?.output ?? 0,
          cache: {
            read: model.cost?.cache_read ?? 0,
            write: model.cost?.cache_write ?? 0,
          },
        },
        limit: {
          context: model.limit?.context ?? 0,
          input: model.limit?.input,
          output: model.limit?.output ?? 0,
        },
        status: model.status ?? "active",
        options: model.options ?? {},
        headers: model.headers ?? {},
        release_date: model.release_date ?? "",
        variants: model.variants,
      })
    })
    return [...rows.values()].sort((a, b) => {
      const ai = orderIndex.get(a.id)
      const bi = orderIndex.get(b.id)
      if (ai !== undefined && bi !== undefined) return ai - bi
      if (ai !== undefined) return -1
      if (bi !== undefined) return 1
      if (a.release_date && b.release_date && a.release_date !== b.release_date) {
        return b.release_date.localeCompare(a.release_date)
      }
      if (a.release_date) return -1
      if (b.release_date) return 1
      return a.id.localeCompare(b.id)
    })
  })
  const isOlder = (model: Model) => {
    if (obsoleteModel(model.id)) return true
    if (model.status === "deprecated") return true
    if (!model.release_date) return false
    const date = DateTime.fromISO(model.release_date)
    if (!date.isValid) return false
    return date < DateTime.now().minus({ months: 6 })
  }
  const currentModels = createMemo(() => models().filter((model) => !isOlder(model)))
  const filteredModels = (providerID: string) => {
    const filter = store.modelFilter[providerID]?.trim().toLowerCase()
    if (!filter) return currentModels()
    return currentModels().filter((model) => model.id.toLowerCase().includes(filter))
  }
  const isManualModel = (providerID: string, modelID: string) =>
    !!globalSync.data.config.provider?.[providerID]?.models?.[modelID]
  const isEnabled = (providerID: string, modelID: string) =>
    !(globalSync.data.config.provider?.[providerID]?.blacklist ?? []).includes(modelID)
  const releaseLabel = (model: Model) => {
    if (!model.release_date) return language.t("settings.providers.models.releaseUnknown")
    const date = DateTime.fromISO(model.release_date)
    return date.isValid ? date.toFormat("yyyy-LL-dd") : model.release_date
  }

  const updateProviderConfig = async (
    item: ProviderItem,
    config: NonNullable<typeof globalSync.data.config.provider>[string],
  ) =>
    globalSync.updateConfig({
      provider: {
        [item.id]: config,
      },
      disabled_providers: (globalSync.data.config.disabled_providers ?? []).filter((id) => id !== item.id),
    })

  const setModelEnabled = async (item: ProviderItem, model: Model, enabled: boolean) => {
    const saved = globalSync.data.config.provider?.[item.id] ?? {}
    const blacklist = enabled
      ? (saved.blacklist ?? []).filter((id) => id !== model.id)
      : [...new Set([...(saved.blacklist ?? []), model.id])]
    await updateProviderConfig(item, {
      ...saved,
      name: item.name,
      blacklist,
    }).catch((err: unknown) => {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    })
  }

  const addModel = async (item: ProviderItem) => {
    const id = store.newModel[item.id]?.id?.trim()
    if (!id) {
      setStore("newModel", item.id, "error", language.t("provider.custom.error.required"))
      return
    }
    if (models().some((model) => model.id === id)) {
      setStore("newModel", item.id, "error", language.t("provider.custom.error.duplicate"))
      return
    }

    const saved = globalSync.data.config.provider?.[item.id] ?? {}
    const order = parseModelOrder(saved.options?.modelOrder).filter((modelID) => modelID !== id)
    await updateProviderConfig(item, {
      ...saved,
      name: item.name,
      options: {
        ...(saved.options ?? {}),
        modelOrder: [id, ...order],
      },
      blacklist: (saved.blacklist ?? []).filter((modelID) => modelID !== id),
      models: {
        ...(saved.models ?? {}),
        [id]: {
          name: latestModels(item, modelsDev.providers)[id]?.name ?? id,
        },
      },
    })
      .then(() => {
        batch(() => {
          setStore("newModel", item.id, { id: "", error: undefined })
          setStore("addingModel", item.id, false)
        })
      })
      .catch((err: unknown) => {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
  }

  const removeModel = async (item: ProviderItem, model: Model) => {
    const saved = globalSync.data.config.provider?.[item.id] ?? {}
    const nextModels = { ...(saved.models ?? {}) }
    delete nextModels[model.id]
    await updateProviderConfig(item, {
      ...saved,
      name: item.name,
      blacklist: [...new Set([...(saved.blacklist ?? []), model.id])],
      options: {
        ...(saved.options ?? {}),
        modelOrder: parseModelOrder(saved.options?.modelOrder).filter((modelID) => modelID !== model.id),
      },
      models: nextModels,
    }).catch((err: unknown) => {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    })
  }

  const resetCustomProvider = () => {
    setStore("custom", {
      providerID: "",
      name: "",
      baseURL: "",
      apiKey: "",
      models: [modelRow()],
      headers: [headerRow()],
      err: {},
    })
  }

  const openCustomProvider = () => {
    batch(() => {
      resetCustomProvider()
      setShowCustomKey(false)
      setStore("mode", "custom")
    })
  }

  const closeCustomProvider = () => setStore("mode", "provider")

  const refreshProviders = () => {
    setStore("modelRefresh", (value) => value + 1)
    void globalSync.bootstrap()
  }

  const reloadProviders = async () => {
    await globalSDK.client.global.dispose().catch(() => undefined)
    await globalSync.bootstrap()
  }

  const selectProvider = (providerID: string) => {
    setStore("mode", "provider")
    setStore("selectedProviderID", providerID)
    setShowProviderKey(false)
    queueMicrotask(() => scrollArea?.scrollTo({ top: 0 }))
  }

  const addCustomModel = () => {
    setStore(
      "custom",
      "models",
      produce((rows) => {
        rows.push(modelRow())
      }),
    )
  }

  const removeCustomModel = (index: number) => {
    if (store.custom.models.length <= 1) return
    setStore(
      "custom",
      "models",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

  const addCustomHeader = () => {
    setStore(
      "custom",
      "headers",
      produce((rows) => {
        rows.push(headerRow())
      }),
    )
  }

  const removeCustomHeader = (index: number) => {
    if (store.custom.headers.length <= 1) return
    setStore(
      "custom",
      "headers",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

  const setCustomField = (key: "providerID" | "name" | "baseURL" | "apiKey", value: string) => {
    setStore("custom", key, value)
    if (key === "apiKey") return
    setStore("custom", "err", key, undefined)
  }

  const setCustomModel = (index: number, key: "id" | "name" | "openaiBaseURL" | "anthropicBaseURL", value: string) => {
    batch(() => {
      setStore("custom", "models", index, key, value)
      setStore("custom", "models", index, "err", key, undefined)
    })
  }

  const setCustomHeader = (index: number, key: "key" | "value", value: string) => {
    batch(() => {
      setStore("custom", "headers", index, key, value)
      setStore("custom", "headers", index, "err", key, undefined)
    })
  }

  const validateCustom = () => {
    const output = validateCustomProvider({
      form: store.custom,
      t: language.t,
      disabledProviders: globalSync.data.config.disabled_providers ?? [],
      existingProviderIDs: new Set(globalSync.data.provider.all.map((provider) => provider.id)),
    })
    batch(() => {
      setStore("custom", "err", output.err)
      output.models.forEach((err, index) => setStore("custom", "models", index, "err", err))
      output.headers.forEach((err, index) => setStore("custom", "headers", index, "err", err))
    })
    return output.result
  }

  const saveCustomProvider = async (event: SubmitEvent) => {
    event.preventDefault()
    if (store.customSaving) return
    const result = validateCustom()
    if (!result) return

    setStore("customSaving", true)
    const disabledProviders = globalSync.data.config.disabled_providers ?? []
    await Promise.resolve()
      .then(async () => {
        if (result.key) {
          await globalSDK.client.auth.set(
            {
              providerID: result.providerID,
              auth: {
                type: "api",
                key: result.key,
              },
            },
            { throwOnError: true },
          )
        }
        await globalSync.updateConfig({
          provider: { [result.providerID]: result.config },
          disabled_providers: disabledProviders.filter((id) => id !== result.providerID),
        })
        await reloadProviders()
      })
      .then(() => {
        batch(() => {
          setStore("selectedProviderID", result.providerID)
          setStore("mode", "provider")
          resetCustomProvider()
        })
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.connect.toast.connected.title", { provider: result.name }),
          description: language.t("provider.connect.toast.connected.description", { provider: result.name }),
        })
      })
      .catch((err: unknown) => {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => setStore("customSaving", false))
  }

  const providerUrls = (item: ProviderItem | undefined) => {
    if (!item) return {}
    const saved = globalSync.data.config.provider?.[item.id]
    const configuredUrls = apiUrls(saved?.options?.apiUrls)
    const currentUrls = apiUrls(item.options.apiUrls)
    const providerModelUrl = (kind: "openai" | "anthropic") =>
      Object.values(item.models).find((model) =>
        kind === "anthropic"
          ? model.api.npm === "@ai-sdk/anthropic" && model.api.url
          : model.api.npm !== "@ai-sdk/anthropic" && model.api.url,
      )?.api.url
    const builtin = builtinProviderUrls[item.id] ?? {}
    const openaiURL =
      store.form[item.id]?.openaiURL ??
      configuredUrls.openai ??
      stringOption(saved?.options?.baseURL) ??
      currentUrls.openai ??
      stringOption(item.options.baseURL) ??
      builtin.openai ??
      providerModelUrl("openai") ??
      ""
    const inferredAnthropicURL = ["openai", "openrouter", "vercel", "google", "github-copilot"].includes(item.id)
      ? undefined
      : anthropicEndpointFromOpenAIURL(openaiURL)
    const anthropicURL =
      store.form[item.id]?.anthropicURL ??
      configuredUrls.anthropic ??
      currentUrls.anthropic ??
      (item.id === "anthropic"
        ? (stringOption(saved?.options?.baseURL) ?? stringOption(item.options.baseURL))
        : undefined) ??
      builtin.anthropic ??
      providerModelUrl("anthropic") ??
      inferredAnthropicURL ??
      ""
    return {
      openai: openaiURL,
      anthropic: anthropicURL,
    }
  }

  const modelUrls = (item: ProviderItem, model: Model) => {
    const urls = providerUrls(item)
    const modelApiUrls = apiUrls(model.options.apiUrls)
    return {
      openai: modelApiUrls.openai ?? (providerOpenAIURLInput?.value.trim() || urls.openai),
      anthropic: modelApiUrls.anthropic ?? (providerAnthropicURLInput?.value.trim() || urls.anthropic),
    }
  }

  const testKey = (providerID: string, modelID: string) => `${providerID}/${modelID}`

  const canDisconnect = (item: ProviderItem) => item.id !== "mimo" && source(item) !== "env" && connected().has(item.id)
  const providerEnabled = (item: ProviderItem) =>
    connected().has(item.id) || configured().has(item.id) || !!store.form[item.id]?.apiKey?.trim()

  const modelConnected = (state: ModelTestState | undefined) =>
    state?.state === "complete" && agentList(state.agents, true).length > 0

  const testableModels = (item: ProviderItem) => currentModels().filter((model) => isEnabled(item.id, model.id))
  const modelTestStates = (item: ProviderItem) =>
    Object.entries(store.tests)
      .filter(([key]) => key.startsWith(`${item.id}/`))
      .map((entry) => entry[1])
  const providerTesting = (item: ProviderItem) => modelTestStates(item).some((state) => state?.state === "testing")
  const providerTestState = (item: ProviderItem) =>
    modelTestStates(item).find((state) => state?.state === "complete" && modelConnected(state)) ??
    modelTestStates(item).find((state) => state?.state === "complete") ??
    modelTestStates(item).find((state) => state?.state === "testing")
  const providerConnected = (item: ProviderItem) => {
    const state = providerTestState(item)
    if (state?.state === "complete") return modelConnected(state)
    return providerEnabled(item)
  }

  const testProvider = async (item: ProviderItem) => {
    await Promise.all(testableModels(item).map((model) => test(item, model)))
  }

  const save = async (item: ProviderItem) => {
    if (store.form[item.id]?.saving) return
    setStore("form", item.id, "saving", true)

    const apiKey = providerApiKeyInput?.value.trim() || store.form[item.id]?.apiKey?.trim()
    const savedUrls = providerUrls(item)
    const urls = {
      openai: cleanURL(providerOpenAIURLInput?.value) || savedUrls.openai,
      anthropic: cleanURL(providerAnthropicURLInput?.value) || savedUrls.anthropic,
    }
    await Promise.resolve()
      .then(async () => {
        if (apiKey) {
          await globalSDK.client.auth.set(
            {
              providerID: item.id,
              auth: {
                type: "api",
                key: apiKey,
              },
            },
            { throwOnError: true },
          )
        }
        const nextApiUrls = {
          ...(urls.openai ? { openai: urls.openai } : {}),
          ...(urls.anthropic ? { anthropic: urls.anthropic } : {}),
        }
        await globalSync.updateConfig({
          provider: {
            [item.id]: {
              ...(globalSync.data.config.provider?.[item.id] ?? {}),
              name: item.name,
              options: {
                ...(globalSync.data.config.provider?.[item.id]?.options ?? {}),
                ...(urls.openai ? { baseURL: urls.openai } : {}),
                ...(Object.keys(nextApiUrls).length ? { apiUrls: nextApiUrls } : {}),
              },
            },
          },
          disabled_providers: (globalSync.data.config.disabled_providers ?? []).filter((id) => id !== item.id),
        })
        await reloadProviders()
      })
      .then(() => {
        setStore(
          "form",
          item.id,
          produce((row) => {
            row.apiKey = ""
          }),
        )
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.providers.save.success.title", { provider: item.name }),
          description: language.t("settings.providers.save.success.description"),
        })
      })
      .catch((err: unknown) => {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => setStore("form", item.id, "saving", false))
  }

  const disconnect = async (item: ProviderItem) => {
    if (store.form[item.id]?.disconnecting) return
    setStore("form", item.id, "disconnecting", true)
    await globalSDK.client.auth
      .remove({ providerID: item.id })
      .then(async () => {
        if (source(item) === "config" || source(item) === "custom") {
          await globalSync.updateConfig({
            disabled_providers: [...new Set([...(globalSync.data.config.disabled_providers ?? []), item.id])],
          })
          await reloadProviders()
          return
        }
        await reloadProviders()
      })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: item.name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: item.name }),
        })
      })
      .catch((err: unknown) => {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => setStore("form", item.id, "disconnecting", false))
  }

  const test = async (item: ProviderItem, model: Model) => {
    const key = testKey(item.id, model.id)
    if (store.tests[key]?.state === "testing") return
    setStore("tests", key, { state: "testing" })
    await globalSDK.client.provider
      .test(
        {
          directory: directory(),
          providerID: item.id,
          modelID: model.id,
          apiKey: providerApiKeyInput?.value.trim() || store.form[item.id]?.apiKey?.trim() || undefined,
          openaiURL: modelUrls(item, model).openai,
          anthropicURL: modelUrls(item, model).anthropic,
        },
        { throwOnError: true },
      )
      .then((result) => {
        if (!result.data?.agents?.length) throw new Error(language.t("common.requestFailed"))
        setStore("tests", key, { state: "complete", agents: result.data.agents })
      })
      .catch((err: unknown) => {
        setStore("tests", key, {
          state: "complete",
          agents: [
            {
              agent: "opencode",
              ok: false,
              message: err instanceof Error ? err.message : String(err),
            },
          ],
        })
      })
  }

  const agentList = (agents: AgentResult[] | undefined, ok: boolean) => (agents ?? []).filter((item) => item.ok === ok)
  const agentMessage = (agent: AgentResult) =>
    [agent.status ? `HTTP ${agent.status}` : undefined, agent.message]
      .filter((item): item is string => !!item)
      .join(" - ")
  const agentMessages = (agents: AgentResult[] | undefined, ok: boolean) => [
    ...new Set(agentList(agents, ok).map(agentMessage).filter((item) => item.length > 0)),
  ]
  const agentTag = (agent: AgentResult) => (
    <Tooltip placement="top" value={agentMessage(agent)} contentClass="max-w-[360px] break-words">
      <Tag class="whitespace-nowrap">{agentLabels[agent.agent]}</Tag>
    </Tooltip>
  )

  const renderModelRow = (item: ProviderItem, model: Model) => {
    const state = () => store.tests[testKey(item.id, model.id)]
    const manual = () => isManualModel(item.id, model.id)
    return (
      <div class="flex flex-col gap-2 border-b border-border-weak-base px-3 py-2.5 last:border-none">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <span
              classList={{
                "size-1.5 rounded-full shrink-0": true,
                "bg-icon-success-base": modelConnected(state()),
                "bg-icon-weak-base": !modelConnected(state()),
                "animate-pulse": state()?.state === "testing",
              }}
              aria-label={
                modelConnected(state())
                  ? language.t("settings.providers.models.status.connected")
                  : language.t("settings.providers.models.status.disconnected")
              }
            />
            <button
              type="button"
              class="min-w-0 truncate text-left font-mono text-14-medium text-text-strong hover:text-text-interactive-base"
              onClick={() => void test(item, model)}
            >
              {model.id}
            </button>
            <Show when={isOlder(model)}>
              <Tag>{language.t("settings.providers.models.older")}</Tag>
            </Show>
            <Show when={manual()}>
              <Tag>{language.t("settings.providers.models.custom")}</Tag>
            </Show>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <Tooltip placement="top" value={language.t("settings.providers.models.toggle")}>
              <Switch
                checked={isEnabled(item.id, model.id)}
                onChange={(checked) => void setModelEnabled(item, model, checked)}
                hideLabel
              >
                {model.id}
              </Switch>
            </Tooltip>
            <Tooltip placement="top" value={language.t("settings.providers.test.action")}>
              <IconButton
                type="button"
                icon={state()?.state === "complete" ? "circle-check" : "link"}
                variant="ghost"
                disabled={state()?.state === "testing" || !isEnabled(item.id, model.id)}
                onClick={() => void test(item, model)}
                aria-label={language.t("settings.providers.test.action")}
              />
            </Tooltip>
            <Show when={manual()}>
              <Tooltip placement="top" value={language.t("settings.providers.models.remove")}>
                <IconButton
                  type="button"
                  icon="trash"
                  variant="ghost"
                  onClick={() => void removeModel(item, model)}
                  aria-label={language.t("settings.providers.models.remove")}
                />
              </Tooltip>
            </Show>
          </div>
        </div>
        <Show when={state()?.state === "complete"}>
          <div class="flex flex-col gap-2 text-12-regular">
            <div class="flex flex-wrap items-center gap-2 text-text-on-success-base">
              <Icon name="circle-check" size="small" />
              <span>{language.t("settings.providers.test.available", { agents: "" })}</span>
              <div class="flex flex-wrap gap-1.5">
                <Show
                  when={agentList(state()?.agents, true).length > 0}
                  fallback={<span>{language.t("settings.providers.test.none")}</span>}
                >
                  <For each={agentList(state()?.agents, true)}>{(agent) => agentTag(agent)}</For>
                </Show>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-text-on-critical-base">
              <Icon name="circle-ban-sign" size="small" />
              <span>{language.t("settings.providers.test.unavailable", { agents: "" })}</span>
              <div class="flex flex-wrap gap-1.5">
                <Show
                  when={agentList(state()?.agents, false).length > 0}
                  fallback={<span>{language.t("settings.providers.test.none")}</span>}
                >
                  <For each={agentList(state()?.agents, false)}>{(agent) => agentTag(agent)}</For>
                </Show>
              </div>
              <Show when={agentMessages(state()?.agents, false).length > 0}>
                <span class="min-w-0 break-words text-text-weak">
                  {language.t("settings.providers.test.reason", {
                    reason: agentMessages(state()?.agents, false).join(language.t("settings.providers.test.separator")),
                  })}
                </span>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    )
  }

  return (
    <div
      ref={scrollArea}
      class="flex h-full w-full min-w-0 flex-1 flex-col self-stretch overflow-y-auto no-scrollbar px-4 pb-10 sm:px-6 sm:pb-10"
    >
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex w-full max-w-[1240px] items-end justify-between gap-4 pt-6 pb-7">
          <div class="flex flex-col gap-6">
            <h2 class="text-[28px] leading-[34px] font-semibold text-text-strong">
              {language.t("settings.providers.title")}
            </h2>
            <p class="text-14-regular text-text-base">{language.t("settings.providers.description")}</p>
          </div>
          <Button size="small" variant="ghost" onClick={refreshProviders}>
            {language.t("common.refresh")}
          </Button>
        </div>
      </div>

      <div class="grid min-h-[620px] w-full max-w-[1240px] grid-cols-1 overflow-x-hidden rounded-lg border border-border-weak-base bg-surface-base lg:grid-cols-[220px_minmax(0,1fr)]">
        <div class="flex flex-col gap-2 border-b border-border-weak-base p-2 lg:border-b-0 lg:border-r">
          <For each={providerSections()}>
            {(section) => (
              <div class="flex flex-col gap-1">
                <div class="px-1.5 text-11-medium text-text-weak">{section.title}</div>
                <For each={section.items}>
                  {(item) => (
                    <button
                      type="button"
                      classList={{
                        "w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left hover:bg-surface-stronger-base": true,
                        "border-border-interactive-base bg-surface-interactive-base":
                          store.mode === "provider" && selected()?.id === item.id,
                        "border-transparent": !(store.mode === "provider" && selected()?.id === item.id),
                      }}
                      onClick={() => {
                        selectProvider(item.id)
                      }}
                    >
                      <ProviderIcon id={item.id} class="size-4 shrink-0 icon-strong-base" />
                      <span class="min-w-0 flex-1 truncate text-14-medium text-text-strong">{item.name}</span>
                      <span
                        classList={{
                          "size-2 rounded-full shrink-0": true,
                          "bg-icon-success-base": providerConnected(item),
                          "bg-icon-weak-base": !providerConnected(item),
                          "animate-pulse": providerTesting(item),
                        }}
                        aria-label={
                          providerConnected(item)
                            ? language.t("settings.providers.status.connected")
                            : language.t("settings.providers.status.disconnected")
                        }
                      />
                    </button>
                  )}
                </For>
              </div>
            )}
          </For>
          <Button size="small" variant="ghost" icon="plus-small" onClick={openCustomProvider} class="self-start">
            {language.t("settings.providers.custom.addShort")}
          </Button>
        </div>

        <Show
          when={store.mode === "custom"}
          fallback={
            <Show
              when={selected()}
              fallback={
                <div class="text-14-regular text-text-weak">{language.t("settings.providers.connected.empty")}</div>
              }
            >
              {(item) => (
                <div class="flex min-w-0 flex-col gap-6 p-5 sm:p-6">
                  <div class="flex flex-col gap-3">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="text-16-medium text-text-strong truncate">{item().name}</span>
                        <Icon name="pencil-line" size="small" class="text-icon-weak-base" />
                        <span
                          classList={{
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-12-medium": true,
                            "bg-surface-success-base text-text-on-success-base": providerConnected(item()),
                            "bg-surface-weak text-text-weak": !providerConnected(item()),
                          }}
                        >
                          <span
                            classList={{
                              "size-1.5 rounded-full": true,
                              "bg-icon-success-base": providerConnected(item()),
                              "bg-icon-weak-base": !providerConnected(item()),
                              "animate-pulse": providerTestState(item())?.state === "testing",
                            }}
                          />
                          {providerConnected(item())
                            ? language.t("settings.providers.status.enabled")
                            : language.t("settings.providers.status.disabled")}
                        </span>
                      </div>
                      <div class="flex items-center gap-2">
                        <Show when={canDisconnect(item())}>
                          <Button
                            size="small"
                            variant="ghost"
                            disabled={store.form[item().id]?.disconnecting}
                            onClick={() => void disconnect(item())}
                          >
                            {language.t("common.disconnect")}
                          </Button>
                        </Show>
                        <Show
                          when={item().id === "mimo"}
                          fallback={
                            <>
                              <Button
                                size="small"
                                variant="ghost"
                                icon={modelConnected(providerTestState(item())) ? "circle-check" : "link"}
                                disabled={providerTesting(item())}
                                onClick={() => void testProvider(item())}
                              >
                                {providerTesting(item())
                                  ? language.t("settings.providers.test.testing")
                                  : language.t("settings.providers.test.action")}
                              </Button>
                              <Button
                                size="small"
                                variant="primary"
                                icon="check"
                                disabled={store.form[item().id]?.saving}
                                onClick={() => void save(item())}
                              >
                                {store.form[item().id]?.saving
                                  ? language.t("common.saving")
                                  : language.t("common.save")}
                              </Button>
                            </>
                          }
                        >
                          <Button
                            size="small"
                            variant="ghost"
                            icon="square-arrow-top-right"
                            onClick={() => dialog.show(() => <DialogConnectProvider provider="xiaomi" />)}
                          >
                            {language.t("settings.providers.mimo.authorize")}
                          </Button>
                          <Button
                            size="small"
                            variant="primary"
                            icon={modelConnected(providerTestState(item())) ? "circle-check" : "link"}
                            disabled={providerTesting(item())}
                            onClick={() => void testProvider(item())}
                          >
                            {providerTesting(item())
                              ? language.t("settings.providers.test.testing")
                              : language.t("settings.providers.test.action")}
                          </Button>
                        </Show>
                      </div>
                    </div>

                    <div class="flex flex-col gap-3">
                      <TextField
                        ref={(el: HTMLInputElement) => {
                          providerAnthropicURLInput = el
                        }}
                        type="text"
                        label={language.t("settings.providers.url.anthropic.label")}
                        placeholder="https://api.anthropic.com"
                        value={providerUrls(item()).anthropic}
                        onChange={(value) => setStore("form", item().id, "anthropicURL", value)}
                      />
                      <TextField
                        ref={(el: HTMLInputElement) => {
                          providerOpenAIURLInput = el
                        }}
                        type="text"
                        label={language.t("settings.providers.url.openai.label")}
                        placeholder="https://api.openai.com/v1"
                        value={providerUrls(item()).openai}
                        onChange={(value) => setStore("form", item().id, "openaiURL", value)}
                      />
                      <TextField
                        ref={(el: HTMLInputElement) => {
                          providerApiKeyInput = el
                        }}
                        type={showProviderKey() ? "text" : "password"}
                        label={language.t("settings.providers.apiKey.label", { provider: item().name })}
                        placeholder={language.t("settings.providers.apiKey.placeholder")}
                        value={store.form[item().id]?.apiKey ?? ""}
                        onChange={(value) => setStore("form", item().id, "apiKey", value)}
                        trailing={
                          <Tooltip
                            placement="top"
                            value={
                              showProviderKey()
                                ? language.t("settings.providers.apiKey.hide")
                                : language.t("settings.providers.apiKey.show")
                            }
                          >
                            <IconButton
                              type="button"
                              icon="eye"
                              variant="ghost"
                              tabIndex={-1}
                              data-slot="input-trailing"
                              aria-label={
                                showProviderKey()
                                  ? language.t("settings.providers.apiKey.hide")
                                  : language.t("settings.providers.apiKey.show")
                              }
                              onClick={() => setShowProviderKey((value) => !value)}
                            />
                          </Tooltip>
                        }
                      />
                    </div>
                  </div>

                  <div class="flex flex-col gap-3">
                    <h3 class="text-14-medium text-text-strong">{language.t("settings.providers.section.models")}</h3>
                    <div class="overflow-hidden rounded-md border border-border-weak-base">
                      <Show
                        when={filteredModels(item().id).length > 0}
                        fallback={
                          <div class="py-4 text-14-regular text-text-weak">{language.t("dialog.model.empty")}</div>
                        }
                      >
                        <For each={filteredModels(item().id)}>{(model) => renderModelRow(item(), model)}</For>
                      </Show>
                      <div class="border-t border-border-weak-base bg-surface-base px-3 py-2 flex flex-col gap-3">
                        <Show
                          when={store.addingModel[item().id]}
                          fallback={
                            <Button
                              type="button"
                              size="small"
                              variant="ghost"
                              icon="plus-small"
                              class="self-start"
                              onClick={() => setStore("addingModel", item().id, true)}
                            >
                              {language.t("settings.providers.models.add.action")}
                            </Button>
                          }
                        >
                          <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-start">
                            <TextField
                              label={language.t("settings.providers.models.add.id")}
                              hideLabel
                              placeholder={language.t("settings.providers.models.add.idPlaceholder")}
                              value={store.newModel[item().id]?.id ?? ""}
                              onChange={(value) => {
                                setStore("newModel", item().id, "id", value)
                                setStore("newModel", item().id, "error", undefined)
                              }}
                              error={store.newModel[item().id]?.error}
                            />
                            <Button
                              type="button"
                              size="small"
                              variant="ghost"
                              icon="plus-small"
                              class="mt-1.5 md:mt-0"
                              onClick={() => void addModel(item())}
                            >
                              {language.t("settings.providers.models.add.action")}
                            </Button>
                            <Button
                              type="button"
                              size="small"
                              variant="ghost"
                              class="mt-1.5 md:mt-0"
                              onClick={() => {
                                batch(() => {
                                  setStore("addingModel", item().id, false)
                                  setStore("newModel", item().id, { id: "", error: undefined })
                                })
                              }}
                            >
                              {language.t("common.cancel")}
                            </Button>
                          </div>
                        </Show>
                        <Show when={modelsDev.loading}>
                          <div class="text-12-regular text-text-weak">
                            {language.t("settings.providers.models.loading")}
                          </div>
                        </Show>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Show>
          }
        >
          <div class="flex min-w-0 flex-col gap-6 p-5 sm:p-6">
            <div class="flex flex-col gap-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  <ProviderIcon id="synthetic" class="size-5 shrink-0 icon-strong-base" />
                  <span class="text-16-medium text-text-strong">{language.t("provider.custom.title")}</span>
                </div>
                <div class="flex items-center gap-2">
                  <Button size="small" variant="ghost" onClick={closeCustomProvider}>
                    {language.t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    form="custom-provider-settings-form"
                    size="small"
                    variant="primary"
                    icon="check"
                    disabled={store.customSaving}
                  >
                    {store.customSaving ? language.t("common.saving") : language.t("common.save")}
                  </Button>
                </div>
              </div>

              <div>
                <form id="custom-provider-settings-form" onSubmit={saveCustomProvider} class="flex flex-col gap-6">
                  <p class="text-14-regular text-text-base">
                    {language.t("provider.custom.description.prefix")}
                    <Link href="https://opencode.ai/docs/providers/#custom-provider" tabIndex={-1}>
                      {language.t("provider.custom.description.link")}
                    </Link>
                    {language.t("provider.custom.description.suffix")}
                  </p>

                  <div class="flex flex-col gap-4">
                    <TextField
                      autofocus
                      label={language.t("provider.custom.field.providerID.label")}
                      placeholder={language.t("provider.custom.field.providerID.placeholder")}
                      description={language.t("provider.custom.field.providerID.description")}
                      value={store.custom.providerID}
                      onChange={(v) => setCustomField("providerID", v)}
                      validationState={store.custom.err.providerID ? "invalid" : undefined}
                      error={store.custom.err.providerID}
                    />
                    <TextField
                      label={language.t("provider.custom.field.name.label")}
                      placeholder={language.t("provider.custom.field.name.placeholder")}
                      value={store.custom.name}
                      onChange={(v) => setCustomField("name", v)}
                      validationState={store.custom.err.name ? "invalid" : undefined}
                      error={store.custom.err.name}
                    />
                    <TextField
                      label={language.t("provider.custom.field.baseURL.label")}
                      placeholder={language.t("provider.custom.field.baseURL.placeholder")}
                      value={store.custom.baseURL}
                      onChange={(v) => setCustomField("baseURL", v)}
                      validationState={store.custom.err.baseURL ? "invalid" : undefined}
                      error={store.custom.err.baseURL}
                    />
                    <TextField
                      type={showCustomKey() ? "text" : "password"}
                      label={language.t("provider.custom.field.apiKey.label")}
                      placeholder={language.t("provider.custom.field.apiKey.placeholder")}
                      description={language.t("provider.custom.field.apiKey.description")}
                      value={store.custom.apiKey}
                      onChange={(v) => setCustomField("apiKey", v)}
                      trailing={
                        <Tooltip
                          placement="top"
                          value={
                            showCustomKey()
                              ? language.t("settings.providers.apiKey.hide")
                              : language.t("settings.providers.apiKey.show")
                          }
                        >
                          <IconButton
                            type="button"
                            icon="eye"
                            variant="ghost"
                            tabIndex={-1}
                            data-slot="input-trailing"
                            aria-label={
                              showCustomKey()
                                ? language.t("settings.providers.apiKey.hide")
                                : language.t("settings.providers.apiKey.show")
                            }
                            onClick={() => setShowCustomKey((value) => !value)}
                          />
                        </Tooltip>
                      }
                    />
                  </div>

                  <div class="flex flex-col gap-3">
                    <label class="text-12-medium text-text-weak">{language.t("provider.custom.models.label")}</label>
                    <For each={store.custom.models}>
                      {(m, i) => (
                        <div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start" data-row={m.row}>
                          <TextField
                            label={language.t("provider.custom.models.id.label")}
                            hideLabel
                            placeholder={language.t("provider.custom.models.id.placeholder")}
                            value={m.id}
                            onChange={(v) => setCustomModel(i(), "id", v)}
                            validationState={m.err.id ? "invalid" : undefined}
                            error={m.err.id}
                          />
                          <TextField
                            label={language.t("provider.custom.models.name.label")}
                            hideLabel
                            placeholder={language.t("provider.custom.models.name.placeholder")}
                            value={m.name}
                            onChange={(v) => setCustomModel(i(), "name", v)}
                            validationState={m.err.name ? "invalid" : undefined}
                            error={m.err.name}
                          />
                          <IconButton
                            type="button"
                            icon="trash"
                            variant="ghost"
                            class="mt-1.5"
                            onClick={() => removeCustomModel(i())}
                            disabled={store.custom.models.length <= 1}
                            aria-label={language.t("provider.custom.models.remove")}
                          />
                          <TextField
                            label={language.t("provider.custom.models.openaiBaseURL.label")}
                            hideLabel
                            placeholder={language.t("provider.custom.models.openaiBaseURL.placeholder")}
                            value={m.openaiBaseURL}
                            onChange={(v) => setCustomModel(i(), "openaiBaseURL", v)}
                            validationState={m.err.openaiBaseURL ? "invalid" : undefined}
                            error={m.err.openaiBaseURL}
                          />
                          <TextField
                            label={language.t("provider.custom.models.anthropicBaseURL.label")}
                            hideLabel
                            placeholder={language.t("provider.custom.models.anthropicBaseURL.placeholder")}
                            value={m.anthropicBaseURL}
                            onChange={(v) => setCustomModel(i(), "anthropicBaseURL", v)}
                            validationState={m.err.anthropicBaseURL ? "invalid" : undefined}
                            error={m.err.anthropicBaseURL}
                          />
                        </div>
                      )}
                    </For>
                    <Button
                      type="button"
                      size="small"
                      variant="ghost"
                      icon="plus-small"
                      onClick={addCustomModel}
                      class="self-start"
                    >
                      {language.t("provider.custom.models.add")}
                    </Button>
                  </div>

                  <div class="flex flex-col gap-3">
                    <label class="text-12-medium text-text-weak">{language.t("provider.custom.headers.label")}</label>
                    <For each={store.custom.headers}>
                      {(h, i) => (
                        <div class="flex gap-2 items-start" data-row={h.row}>
                          <div class="flex-1">
                            <TextField
                              label={language.t("provider.custom.headers.key.label")}
                              hideLabel
                              placeholder={language.t("provider.custom.headers.key.placeholder")}
                              value={h.key}
                              onChange={(v) => setCustomHeader(i(), "key", v)}
                              validationState={h.err.key ? "invalid" : undefined}
                              error={h.err.key}
                            />
                          </div>
                          <div class="flex-1">
                            <TextField
                              label={language.t("provider.custom.headers.value.label")}
                              hideLabel
                              placeholder={language.t("provider.custom.headers.value.placeholder")}
                              value={h.value}
                              onChange={(v) => setCustomHeader(i(), "value", v)}
                              validationState={h.err.value ? "invalid" : undefined}
                              error={h.err.value}
                            />
                          </div>
                          <IconButton
                            type="button"
                            icon="trash"
                            variant="ghost"
                            class="mt-1.5"
                            onClick={() => removeCustomHeader(i())}
                            disabled={store.custom.headers.length <= 1}
                            aria-label={language.t("provider.custom.headers.remove")}
                          />
                        </div>
                      )}
                    </For>
                    <Button
                      type="button"
                      size="small"
                      variant="ghost"
                      icon="plus-small"
                      onClick={addCustomHeader}
                      class="self-start"
                    >
                      {language.t("provider.custom.headers.add")}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
