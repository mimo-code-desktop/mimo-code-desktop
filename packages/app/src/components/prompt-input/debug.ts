import { createStore, produce } from "solid-js/store"

export type PromptRequestDebugStage =
  | "preparing"
  | "queued"
  | "creating-session"
  | "waiting-worktree"
  | "sending-shell"
  | "sending-command"
  | "sending-prompt"
  | "sent"
  | "failed"
  | "cancelled"

export type PromptRequestDebugKind = "prompt" | "command" | "shell"

export type PromptRequestDebugEntry = {
  id: string
  sessionID?: string
  directory: string
  kind: PromptRequestDebugKind
  stage: PromptRequestDebugStage
  startedAt: number
  updatedAt: number
  completedAt?: number
  agent: string
  model: string
  variant?: string
  textLength: number
  imageCount: number
  contextCount: number
  partCount?: number
  message?: string
  error?: string
}

const [store, setStore] = createStore({
  entries: [] as PromptRequestDebugEntry[],
})

const now = () => Date.now()

const limit = 12

export const PromptRequestDebug = {
  get entries() {
    return store.entries
  },
  start(input: Omit<PromptRequestDebugEntry, "id" | "stage" | "startedAt" | "updatedAt" | "completedAt">) {
    const id = `prompt-debug-${now()}-${Math.random().toString(36).slice(2, 8)}`
    const entry: PromptRequestDebugEntry = {
      ...input,
      id,
      stage: "preparing",
      startedAt: now(),
      updatedAt: now(),
    }
    setStore(
      "entries",
      [entry, ...store.entries].slice(0, limit),
    )
    return id
  },
  update(id: string | undefined, patch: Partial<Omit<PromptRequestDebugEntry, "id" | "startedAt">>) {
    if (!id) return
    const index = store.entries.findIndex((entry) => entry.id === id)
    if (index < 0) return
    setStore(
      "entries",
      index,
      produce((entry) => {
        Object.assign(entry, patch, { updatedAt: now() })
      }),
    )
  },
  finish(id: string | undefined, patch: Pick<PromptRequestDebugEntry, "stage"> & Partial<PromptRequestDebugEntry>) {
    if (!id) return
    PromptRequestDebug.update(id, {
      ...patch,
      completedAt: now(),
    })
  },
  latestFor(input: { sessionID?: string; directory: string }) {
    return store.entries.find((entry) => {
      if (input.sessionID && entry.sessionID === input.sessionID) return true
      return !entry.sessionID && entry.directory === input.directory
    })
  },
}
