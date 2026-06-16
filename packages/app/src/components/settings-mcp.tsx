import type { Config, McpLocalConfig, McpRemoteConfig, McpStatus } from "@mimo-ai/sdk/v2/client"
import { Button } from "@mimo-ai/ui/button"
import { Icon } from "@mimo-ai/ui/icon"
import { TextField } from "@mimo-ai/ui/text-field"
import { showToast } from "@mimo-ai/ui/toast"
import { createMemo, For, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"

type McpConfig = McpLocalConfig | McpRemoteConfig
type ConfigMcp = NonNullable<Config["mcp"]>[string]
type Source = "all" | "zcode" | "claude" | "codex" | "gemini" | "opencode"

const sources: { id: Source; icon: Parameters<typeof Icon>[0]["name"] | "mark"; label: string; mark?: string }[] = [
  { id: "all", icon: "sliders", label: "settings.mcp.source.all" },
  { id: "zcode", icon: "terminal", label: "settings.mcp.source.zcode" },
  { id: "claude", icon: "mark", mark: "*", label: "settings.mcp.source.claude" },
  { id: "codex", icon: "settings-gear", label: "settings.mcp.source.codex" },
  { id: "gemini", icon: "mark", mark: "◆", label: "settings.mcp.source.gemini" },
  { id: "opencode", icon: "status", label: "settings.mcp.source.opencode" },
]

function isMcpConfig(config: ConfigMcp | undefined): config is McpConfig {
  return !!config && "type" in config && (config.type === "local" || config.type === "remote")
}

function statusTone(status: McpStatus["status"] | undefined) {
  if (status === "connected") return "bg-icon-success-base"
  if (status === "failed" || status === "needs_client_registration") return "bg-icon-critical-base"
  if (status === "needs_auth" || status === "pending") return "bg-icon-warning-base"
  return "bg-icon-weak-base"
}

export const SettingsMcp = () => {
  const language = useLanguage()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const [store, setStore] = createStore({
    filter: "",
    source: "all" as Source,
    status: {} as Record<string, McpStatus>,
  })

  const rows = createMemo(() =>
    Object.entries(globalSync.data.config.mcp ?? {})
      .filter((entry): entry is [string, McpConfig] => isMcpConfig(entry[1]))
      .map(([name, config]) => ({ name, config, status: store.status[name] }))
      .filter((item) => item.name.toLowerCase().includes(store.filter.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )

  const refreshStatus = async () => {
    await globalSDK.client.mcp
      .status()
      .then((result) => setStore("status", result.data ?? {}))
      .catch((err: unknown) => {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
  }

  const startAdd = () => {
    showToast({
      title: language.t("settings.mcp.addSoon.title"),
      description: language.t("settings.mcp.addSoon.description"),
    })
  }

  onMount(() => {
    void refreshStatus()
  })

  return (
    <div class="h-full overflow-y-auto bg-surface-stronger-non-alpha">
      <div class="mx-auto flex w-full max-w-[832px] flex-col px-8 pb-10 pt-11">
        <div class="flex items-start justify-between gap-6">
          <div class="min-w-0">
            <h1 class="text-[30px] font-bold leading-9 tracking-normal text-text-strong">
              {language.t("settings.mcp.title")}
            </h1>
            <p class="mt-7 text-14-regular text-text-base">{language.t("settings.mcp.description")}</p>
          </div>
          <Button size="small" variant="secondary" icon="plus-small" class="mt-[58px]" onClick={startAdd}>
            {language.t("settings.mcp.action.add")}
          </Button>
        </div>

        <div class="mt-5">
          <TextField
            type="text"
            label={language.t("settings.mcp.search.label")}
            hideLabel
            placeholder={language.t("settings.mcp.search.placeholder")}
            value={store.filter}
            onChange={(value) => setStore("filter", value)}
          />
        </div>

        <div class="mt-4 inline-flex max-w-full self-start overflow-hidden rounded-lg border border-border-weak-base bg-surface-base p-1">
          <For each={sources}>
            {(source) => (
              <button
                type="button"
                classList={{
                  "flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-12-medium": true,
                  "bg-surface-info-base text-text-strong": store.source === source.id,
                  "text-text-weak hover:text-text-base": store.source !== source.id,
                }}
                onClick={() => setStore("source", source.id)}
              >
                {source.icon === "mark" ? (
                  <span class="flex size-4 items-center justify-center text-14-medium text-icon-weak-base">{source.mark}</span>
                ) : (
                  <Icon name={source.icon} size="small" />
                )}
                <span class="whitespace-nowrap">{language.t(source.label)}</span>
              </button>
            )}
          </For>
        </div>

        <div class="mt-4 min-h-[160px] rounded-lg border border-border-weak-base bg-surface-base">
          {rows().length === 0 ? (
            <div class="flex min-h-[160px] flex-col items-center justify-center px-6 py-8 text-center">
              <div class="text-14-medium text-text-strong">{language.t("settings.mcp.empty.title")}</div>
              <div class="mt-2 text-14-regular text-text-base">{language.t("settings.mcp.empty.description")}</div>
              <Button size="small" variant="secondary" icon="plus-small" class="mt-4" onClick={startAdd}>
                {language.t("settings.mcp.action.add")}
              </Button>
            </div>
          ) : (
            <div class="divide-y divide-border-weak-base">
              <For each={rows()}>
                {(item) => (
                  <div class="flex items-center justify-between gap-4 px-4 py-3">
                    <div class="flex min-w-0 items-center gap-3">
                      <span class={`size-2 rounded-full ${statusTone(item.status?.status)}`} />
                      <div class="min-w-0">
                        <div class="truncate text-14-medium text-text-strong">{item.name}</div>
                        <div class="truncate text-12-regular text-text-weak">
                          {item.config.type === "local"
                            ? language.t("settings.mcp.type.local")
                            : language.t("settings.mcp.type.remote")}
                        </div>
                      </div>
                    </div>
                    <Button size="small" variant="ghost">
                      {language.t("settings.mcp.action.edit")}
                    </Button>
                  </div>
                )}
              </For>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
