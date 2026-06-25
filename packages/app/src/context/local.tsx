import { createSimpleContext } from "@mimo-ai/ui/context"
import { base64Encode } from "@mimo-ai/shared/util/encode"
import { useParams } from "@solidjs/router"
import { batch, createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useModels } from "@/context/models"
import { useProviders } from "@/hooks/use-providers"
import { Persist, persisted } from "@/utils/persist"
import { cycleModelVariant, getConfiguredAgentVariant, resolveModelVariant } from "./model-variant"
import { useSDK } from "./sdk"
import { useSync } from "./sync"

export type ModelKey = { providerID: string; modelID: string; variant?: string }
export type ModelTarget = "mimo" | "claude" | "codex" | "opencode"

type State = {
  agent?: string
  model?: ModelKey
  variant?: string | null
  target?: Partial<Record<ModelTarget, ModelKey | undefined>>
  targetVariant?: Partial<Record<ModelTarget, string | null | undefined>>
}

type Saved = {
  session: Record<string, State | undefined>
}

const WORKSPACE_KEY = "__workspace__"
const handoff = new Map<string, State>()

const handoffKey = (dir: string, id: string) => `${dir}\n${id}`
const codexModelIDs = new Set([
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.5",
  "gpt-5.5-codex",
  "gpt-5.5-mini",
])
const targetNativeModel = (target: ModelTarget, model: ModelKey & { api?: { id?: string } }) => {
  if (target === "mimo") return true
  if (target === "opencode") return true
  if (target === "claude") return model.providerID === "anthropic"
  if (target === "codex")
    return model.providerID === "openai" && (model.modelID.includes("codex") || codexModelIDs.has(model.api?.id ?? ""))
  return true
}

const targetModelAllowed = (target: ModelTarget, model: ModelKey & { api?: { npm?: string } }) => {
  if (target === "claude") {
    if (model.providerID === "anthropic") return true
    if (model.providerID === "deepseek") return true
    return model.api?.npm?.includes("@ai-sdk/anthropic") || false
  }
  if (target === "codex") return true
  return true
}

const migrate = (value: unknown) => {
  if (!value || typeof value !== "object") return { session: {} }

  const item = value as {
    session?: Record<string, State | undefined>
    pick?: Record<string, State | undefined>
  }

  if (item.session && typeof item.session === "object") return { session: item.session }
  if (!item.pick || typeof item.pick !== "object") return { session: {} }

  return {
    session: Object.fromEntries(Object.entries(item.pick).filter(([key]) => key !== WORKSPACE_KEY)),
  }
}

const clone = (value: State | undefined) => {
  if (!value) return undefined
  return {
    ...value,
    model: value.model ? { ...value.model } : undefined,
    target: value.target ? { ...value.target } : undefined,
    targetVariant: value.targetVariant ? { ...value.targetVariant } : undefined,
  } satisfies State
}

export const { use: useLocal, provider: LocalProvider } = createSimpleContext({
  name: "Local",
  init: () => {
    const params = useParams()
    const sdk = useSDK()
    const sync = useSync()
    const providers = useProviders()
    const models = useModels()

    const id = createMemo(() => params.id || undefined)
    const list = createMemo(() => sync.data.agent.filter((item) => item.mode !== "subagent" && !item.hidden))
    const connected = createMemo(() => new Set(providers.connected().map((item) => item.id)))

    const [saved, setSaved] = persisted(
      {
        ...Persist.workspace(sdk.directory, "model-selection", ["model-selection.v1"]),
        migrate,
      },
      createStore<Saved>({
        session: {},
      }),
    )

    const [store, setStore] = createStore<{
      current?: string
      draft?: State
      last?: {
        type: "agent" | "model" | "variant"
        agent?: string
        model?: ModelKey | null
        variant?: string | null
      }
    }>({
      current: list()[0]?.name,
      draft: undefined,
      last: undefined,
    })

    const validModel = (model: ModelKey, target?: ModelTarget) => {
      const provider = providers.all().find((item) => item.id === model.providerID)
      const item = provider?.models[model.modelID]
      if (!item || !connected().has(model.providerID)) return false
      if (!target) return true
      return targetModelAllowed(target, { ...model, api: item.api })
    }

    const firstModel = (target: ModelTarget | undefined, ...items: Array<() => ModelKey | undefined>) => {
      for (const item of items) {
        const model = item()
        if (!model) continue
        if (validModel(model, target)) return model
      }
    }

    const pickAgent = (name: string | undefined) => {
      const items = list()
      if (items.length === 0) return undefined
      return items.find((item) => item.name === name) ?? items[0]
    }

    createEffect(() => {
      const items = list()
      if (items.length === 0) {
        if (store.current !== undefined) setStore("current", undefined)
        return
      }
      if (items.some((item) => item.name === store.current)) return
      setStore("current", items[0]?.name)
    })

    const scope = createMemo<State | undefined>(() => {
      const session = id()
      if (!session) return store.draft
      return saved.session[session] ?? handoff.get(handoffKey(sdk.directory, session))
    })

    createEffect(() => {
      const session = id()
      if (!session) return

      const key = handoffKey(sdk.directory, session)
      const next = handoff.get(key)
      if (!next) return
      if (saved.session[session] !== undefined) {
        handoff.delete(key)
        return
      }

      setSaved("session", session, clone(next))
      handoff.delete(key)
    })

    const configuredModel = (target?: ModelTarget) => {
      if (!sync.data.config.model) return
      const [providerID, modelID] = sync.data.config.model.split("/")
      const model = { providerID, modelID }
      if (validModel(model, target)) return model
    }

    const recentModel = (target?: ModelTarget) => {
      for (const item of models.recent.list()) {
        if (validModel(item, target)) return item
      }
    }

    const findDefaultTargetModel = (target: ModelTarget) =>
      providers
        .connected()
        .flatMap((provider) =>
          Object.values(provider.models).map((item) => ({
            providerID: provider.id,
            modelID: item.id,
            api: item.api,
          })),
        )
        .filter((item) => targetNativeModel(target, item))
        .toSorted((a, b) => {
          if (target === "codex") {
            const rank = ["gpt-5.5-codex", "gpt-5.5", "gpt-5.5-mini", "gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex", "gpt-5.1-codex-max"]
            const aRank = rank.indexOf(a.modelID)
            const bRank = rank.indexOf(b.modelID)
            if (aRank >= 0 && bRank >= 0) return aRank - bRank
            if (aRank >= 0) return -1
            if (bRank >= 0) return 1
          }
          return a.modelID.localeCompare(b.modelID)
        })[0]

    const defaultModel = (target?: ModelTarget) => {
      const defaults = providers.default()
      if (target && target !== "mimo" && target !== "opencode") {
        const model = findDefaultTargetModel(target)
        if (model && validModel(model, target)) return model
      }

      const mimo = providers.connected().find((provider) => provider.id === "mimo")
      if (!target || target === "mimo") {
        if (mimo?.models["mimo-auto"]) {
          const model = { providerID: "mimo", modelID: "mimo-auto" }
          if (validModel(model, target)) return model
        }
      }

      for (const provider of providers.connected()) {
        const configured = defaults[provider.id]
        if (configured) {
          const model = { providerID: provider.id, modelID: configured }
          if (validModel(model, target)) return model
        }

        const first = Object.values(provider.models)[0]
        if (!first) continue
        const model = { providerID: provider.id, modelID: first.id }
        if (validModel(model, target)) return model
      }
    }

    const fallback = (target?: ModelTarget) => configuredModel(target) ?? recentModel(target) ?? defaultModel(target)

    const agent = {
      list,
      current() {
        return pickAgent(scope()?.agent ?? store.current)
      },
      set(name: string | undefined) {
        const item = pickAgent(name)
        if (!item) {
          setStore("current", undefined)
          return
        }

        batch(() => {
          setStore("current", item.name)
          setStore("last", {
            type: "agent",
            agent: item.name,
            model: item.model,
            variant: item.variant ?? null,
          })
          const prev = scope()
          const next = {
            agent: item.name,
            model: item.model ?? prev?.model,
            variant: item.variant ?? prev?.variant,
          } satisfies State
          const session = id()
          if (session) {
            setSaved("session", session, next)
            return
          }
          setStore("draft", next)
        })
      },
      move(direction: 1 | -1) {
        const items = list()
        if (items.length === 0) {
          setStore("current", undefined)
          return
        }

        let next = items.findIndex((item) => item.name === agent.current()?.name) + direction
        if (next < 0) next = items.length - 1
        if (next >= items.length) next = 0
        const item = items[next]
        if (!item) return
        agent.set(item.name)
      },
    }

    const current = (target?: ModelTarget) => {
      const item = firstModel(
        target,
        () => (target ? scope()?.target?.[target] : undefined),
        () => scope()?.model,
        () => agent.current()?.model,
        () => fallback(target),
      )
      if (!item) return undefined
      return models.find(item)
    }

    const configured = (target?: ModelTarget) => {
      const item = agent.current()
      const model = current(target)
      if (!item || !model) return undefined
      return getConfiguredAgentVariant({
        agent: { model: item.model, variant: item.variant },
        model: { providerID: model.provider.id, modelID: model.id, variants: model.variants },
      })
    }

    const selected = (target?: ModelTarget) => (target ? scope()?.targetVariant?.[target] : undefined) ?? scope()?.variant

    const snapshot = () => {
      const model = current()
      return {
        agent: agent.current()?.name,
        model: model ? { providerID: model.provider.id, modelID: model.id } : undefined,
        variant: selected(),
      } satisfies State
    }

    const write = (next: Partial<State>) => {
      const state = {
        ...(scope() ?? { agent: agent.current()?.name }),
        ...next,
      } satisfies State

      const session = id()
      if (session) {
        setSaved("session", session, state)
        return
      }
      setStore("draft", state)
    }

    const allowedModel = (target: ModelTarget | undefined, item: ReturnType<typeof models.list>[number]) =>
      !target || targetModelAllowed(target, { ...item, providerID: item.provider.id, modelID: item.id })

    const recent = (target?: ModelTarget) =>
      models
        .recent
        .list()
        .map(models.find)
        .filter((item) => !!item && allowedModel(target, item))

    const model = {
      ready: models.ready,
      current,
      recent,
      list(target?: ModelTarget) {
        return models
          .list()
          .filter((item) => allowedModel(target, item))
      },
      cycle(direction: 1 | -1, target?: ModelTarget) {
        const items = recent(target)
        const item = current(target)
        if (!item) return

        const index = items.findIndex((entry) => entry?.provider.id === item.provider.id && entry?.id === item.id)
        if (index === -1) return

        let next = index + direction
        if (next < 0) next = items.length - 1
        if (next >= items.length) next = 0

        const entry = items[next]
        if (!entry) return
        model.set({ providerID: entry.provider.id, modelID: entry.id }, { target })
      },
      set(item: ModelKey | undefined, options?: { recent?: boolean; target?: ModelTarget }) {
        batch(() => {
          setStore("last", {
            type: "model",
            agent: agent.current()?.name,
            model: item ?? null,
            variant: selected(options?.target),
          })
          write(options?.target ? { target: { ...(scope()?.target ?? {}), [options.target]: item } } : { model: item })
          if (!item) return
          models.setVisibility(item, true)
          if (!options?.recent) return
          models.recent.push(item)
        })
      },
      visible(item: ModelKey) {
        return models.visible(item)
      },
      older(item: ModelKey) {
        return models.older(item)
      },
      setVisibility(item: ModelKey, visible: boolean) {
        models.setVisibility(item, visible)
      },
      forTarget(target: ModelTarget) {
        return {
          ready: models.ready,
          current: () => current(target),
          recent: () => recent(target),
          list: () => model.list(target),
          cycle: (direction: 1 | -1) => model.cycle(direction, target),
          set: (item: ModelKey | undefined, options?: { recent?: boolean }) =>
            model.set(item, { ...options, target }),
          visible: model.visible,
          older: model.older,
          setVisibility: model.setVisibility,
          variant: {
            configured: () => configured(target),
            selected: () => selected(target),
            current() {
              return resolveModelVariant({
                variants: this.list(),
                selected: this.selected(),
                configured: this.configured(),
              })
            },
            list() {
              const item = current(target)
              if (!item?.variants) return []
              return Object.keys(item.variants)
            },
            set(value: string | undefined) {
              batch(() => {
                const item = current(target)
                setStore("last", {
                  type: "variant",
                  agent: agent.current()?.name,
                  model: item ? { providerID: item.provider.id, modelID: item.id } : null,
                  variant: value ?? null,
                })
                write({ targetVariant: { ...(scope()?.targetVariant ?? {}), [target]: value ?? null } })
              })
            },
            cycle() {
              const items = this.list()
              if (items.length === 0) return
              this.set(
                cycleModelVariant({
                  variants: items,
                  selected: this.selected(),
                  configured: this.configured(),
                }),
              )
            },
          },
        }
      },
      variant: {
        configured,
        selected,
        current() {
          return resolveModelVariant({
            variants: this.list(),
            selected: this.selected(),
            configured: this.configured(),
          })
        },
        list() {
          const item = current()
          if (!item?.variants) return []
          return Object.keys(item.variants)
        },
        set(value: string | undefined) {
          batch(() => {
            const model = current()
            setStore("last", {
              type: "variant",
              agent: agent.current()?.name,
              model: model ? { providerID: model.provider.id, modelID: model.id } : null,
              variant: value ?? null,
            })
            write({ variant: value ?? null })
          })
        },
        cycle() {
          const items = this.list()
          if (items.length === 0) return
          this.set(
            cycleModelVariant({
              variants: items,
              selected: this.selected(),
              configured: this.configured(),
            }),
          )
        },
      },
    }

    const result = {
      slug: createMemo(() => base64Encode(sdk.directory)),
      model,
      agent,
      session: {
        reset() {
          setStore("draft", undefined)
        },
        promote(dir: string, session: string) {
          const next = clone(snapshot())
          if (!next) return

          if (dir === sdk.directory) {
            setSaved("session", session, next)
            setStore("draft", undefined)
            return
          }

          handoff.set(handoffKey(dir, session), next)
          setStore("draft", undefined)
        },
        restore(msg: { sessionID: string; agent: string; model: ModelKey }) {
          const session = id()
          if (!session) return
          if (msg.sessionID !== session) return
          if (saved.session[session] !== undefined) return
          if (handoff.has(handoffKey(sdk.directory, session))) return

          setSaved("session", session, {
            agent: msg.agent,
            model: msg.model,
            variant: msg.model.variant ?? null,
          })
        },
      },
    }
    return result
  },
})
