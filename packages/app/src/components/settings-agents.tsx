import { Button } from "@mimo-ai/ui/button"
import { Icon } from "@mimo-ai/ui/icon"
import { Tag } from "@mimo-ai/ui/tag"
import { showToast } from "@mimo-ai/ui/toast"
import { For, Show, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform, type ProgrammingAgentStatus } from "@/context/platform"

const fallbackAgents: ProgrammingAgentStatus[] = [
  {
    id: "mimo",
    name: "MiMo Code",
    command: "mimo",
    packageName: "@mimo-ai/cli",
    installUrl: "https://mimo.xiaomi.com/install",
    installed: false,
    update: "unknown",
  },
  {
    id: "codex",
    name: "Codex",
    command: "codex",
    packageName: "@openai/codex",
    installUrl: "https://developers.openai.com/codex/cli",
    installed: false,
    update: "unknown",
  },
  {
    id: "claude",
    name: "Claude Code",
    command: "claude",
    packageName: "@anthropic-ai/claude-code",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/setup",
    installed: false,
    update: "unknown",
  },
  {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    packageName: "opencode-ai",
    installUrl: "https://opencode.ai/docs",
    installed: false,
    update: "unknown",
  },
]

export const SettingsAgents = () => {
  const language = useLanguage()
  const platform = usePlatform()
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  const [store, setStore] = createStore({
    refreshing: false,
    updating: undefined as ProgrammingAgentStatus["id"] | undefined,
    agents: fallbackAgents,
  })

  const clearRefreshTimer = () => {
    if (!refreshTimer) return
    clearTimeout(refreshTimer)
    refreshTimer = undefined
  }

  const queueRefreshPoll = () => {
    clearRefreshTimer()
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      void loadAgents()
    }, 800)
  }

  const loadAgents = async (options?: { refresh?: boolean }) => {
    if (!platform.getProgrammingAgents) return
    if (options?.refresh) setStore("refreshing", true)
    await platform
      .getProgrammingAgents(options)
      .then((result) => {
        setStore("agents", result.agents)
        setStore("refreshing", result.refreshing)
        if (result.refreshing) queueRefreshPoll()
        if (!result.refreshing) clearRefreshTimer()
      })
      .catch((err: unknown) => {
        setStore("refreshing", false)
        showToast({
          variant: "error",
          title: language.t("settings.agents.toast.refreshFailed.title"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
  }

  const statusLabel = (agent: ProgrammingAgentStatus) => {
    if (!agent.installed) return language.t("settings.agents.status.notInstalled")
    if (agent.update === "latest") return language.t("settings.agents.status.latest")
    if (agent.update === "outdated") return language.t("settings.agents.status.updateAvailable")
    return language.t("settings.agents.status.unknown")
  }

  const statusClass = (agent: ProgrammingAgentStatus) => {
    if (!agent.installed) return "text-text-weak"
    if (agent.update === "latest") return "text-icon-success-base"
    if (agent.update === "outdated") return "text-icon-warning-base"
    return "text-text-weak"
  }

  const versionText = (agent: ProgrammingAgentStatus) => {
    if (!agent.installed) return language.t("settings.agents.version.notInstalled")
    if (agent.currentVersion && agent.latestVersion && agent.update === "latest") {
      return language.t("settings.agents.version.latest", { version: agent.latestVersion })
    }
    if (agent.currentVersion && agent.latestVersion && agent.update === "outdated") {
      return language.t("settings.agents.version.outdated", {
        current: agent.currentVersion,
        latest: agent.latestVersion,
      })
    }
    if (agent.currentVersion) return language.t("settings.agents.version.current", { version: agent.currentVersion })
    return language.t("settings.agents.version.unknown")
  }

  const actionLabel = (agent: ProgrammingAgentStatus) => {
    if (store.updating === agent.id) return language.t("settings.agents.action.updating")
    if (!agent.installed) return language.t("settings.agents.action.install")
    if (agent.update === "outdated") return language.t("settings.agents.action.update")
    return language.t("settings.agents.action.installGuide")
  }

  const handleAction = async (agent: ProgrammingAgentStatus) => {
    if (!agent.installed || agent.update !== "outdated" || !platform.updateProgrammingAgent) {
      platform.openLink(agent.installUrl)
      return
    }

    setStore("updating", agent.id)
    await platform
      .updateProgrammingAgent(agent.id)
      .then(async () => {
        await loadAgents()
        showToast({
          variant: "success",
          title: language.t("settings.agents.toast.updateSucceeded.title", { name: agent.name }),
        })
      })
      .catch((err: unknown) => {
        showToast({
          variant: "error",
          title: language.t("settings.agents.toast.updateFailed.title", { name: agent.name }),
          description: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        setStore("updating", undefined)
      })
  }

  onMount(() => {
    void loadAgents({ refresh: true })
  })

  onCleanup(() => {
    clearRefreshTimer()
  })

  return (
    <div class="h-full overflow-y-auto bg-surface-stronger-non-alpha">
      <div class="mx-auto flex w-full max-w-[832px] flex-col px-8 pb-10 pt-11">
        <div class="flex items-start justify-between gap-6">
          <div class="min-w-0">
            <h1 class="text-[30px] font-bold leading-9 tracking-normal text-text-strong">
              {language.t("settings.agents.title")}
            </h1>
            <p class="mt-7 text-14-regular text-text-base">{language.t("settings.agents.description")}</p>
          </div>
          <Button
            size="small"
            variant="secondary"
            icon="reset"
            class="mt-[58px]"
            disabled={store.refreshing || Boolean(store.updating)}
            onClick={() => void loadAgents({ refresh: true })}
          >
            {store.refreshing
              ? language.t("settings.agents.action.refreshing")
              : language.t("settings.agents.action.refresh")}
          </Button>
        </div>

        <div class="mt-5 rounded-lg border border-border-weak-base bg-surface-base">
          <div class="divide-y divide-border-weak-base">
            <For each={store.agents}>
              {(agent) => (
                <div class="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:flex-nowrap">
                  <div class="flex min-w-0 items-start gap-3">
                    <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-stronger-non-alpha text-icon-base">
                      <Icon name={agent.id === "mimo" ? "models" : "code"} size="small" />
                    </div>
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-14-medium text-text-strong">{agent.name}</span>
                        <Tag class={statusClass(agent)}>{statusLabel(agent)}</Tag>
                      </div>
                      <div class="mt-1 text-12-regular text-text-weak">{versionText(agent)}</div>
                      <Show when={agent.path}>
                        <div class="mt-1 max-w-[480px] truncate font-mono text-11-regular text-text-subtle">{agent.path}</div>
                      </Show>
                    </div>
                  </div>

                  <div class="flex w-full justify-end sm:w-auto sm:shrink-0">
                    <Button
                      size="small"
                      variant={agent.installed && agent.update !== "outdated" ? "ghost" : "secondary"}
                      icon={agent.installed && agent.update !== "outdated" ? "square-arrow-top-right" : "download"}
                      disabled={Boolean(store.updating)}
                      onClick={() => void handleAction(agent)}
                    >
                      {actionLabel(agent)}
                    </Button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}
