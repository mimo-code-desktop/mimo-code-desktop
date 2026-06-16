import { Component, Match, Switch, createSignal, type Accessor } from "solid-js"
import { Dialog } from "@mimo-ai/ui/dialog"
import { Icon } from "@mimo-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsGeneral } from "./settings-general"
import { SettingsKeybinds } from "./settings-keybinds"
import { SettingsMcp } from "./settings-mcp"
import { SettingsProviders } from "./settings-providers"

export type SettingsSection = "general" | "shortcuts" | "providers" | "mcp"

export const SettingsNav: Component<{
  value: Accessor<SettingsSection>
  onChange: (value: SettingsSection) => void
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const itemClass =
    "flex h-8 w-full items-center gap-3 rounded-md px-2 text-left text-14-medium hover:bg-surface-base-hover focus-visible:bg-surface-base-hover focus-visible:outline-none"
  const item = (value: SettingsSection, icon: Parameters<typeof Icon>[0]["name"], label: string) => (
    <button
      type="button"
      classList={{
        [itemClass]: true,
        "bg-surface-base-active text-text-strong": props.value() === value,
        "text-text-base": props.value() !== value,
      }}
      aria-current={props.value() === value ? "page" : undefined}
      onClick={() => props.onChange(value)}
    >
      <Icon name={icon} />
      <span class="truncate">{label}</span>
    </button>
  )

  return (
    <div class="flex h-full w-full flex-col border-l border-t border-border-weaker-base bg-background-base p-3">
      <div class="flex w-full flex-col gap-3 pt-3">
        <div class="flex flex-col gap-1.5">
          <div class="w-full pl-1 text-12-medium text-text-weak">{language.t("settings.section.desktop")}</div>
          <div class="flex w-full flex-col gap-1.5">
            {item("general", "sliders", language.t("settings.tab.general"))}
            {item("shortcuts", "keyboard", language.t("settings.tab.shortcuts"))}
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="w-full pl-1 text-12-medium text-text-weak">{language.t("settings.section.server")}</div>
          <div class="flex w-full flex-col gap-1.5">
            {item("providers", "providers", language.t("settings.providers.title"))}
            {item("mcp", "mcp", language.t("settings.mcp.title"))}
          </div>
        </div>

        <div class="flex flex-col gap-1 py-1 pl-1 text-12-medium text-text-weak">
          <span>{language.t("app.name.desktop")}</span>
          <span class="text-11-regular">v{platform.version}</span>
        </div>
      </div>
    </div>
  )
}

export const SettingsContent: Component<{ value: Accessor<SettingsSection> }> = (props) => {
  return (
    <div class="settings-dialog flex min-h-0 w-full flex-1 self-stretch overflow-hidden bg-surface-stronger-non-alpha">
      <Switch>
        <Match when={props.value() === "general"}>
          <SettingsGeneral />
        </Match>
        <Match when={props.value() === "shortcuts"}>
          <SettingsKeybinds />
        </Match>
        <Match when={props.value() === "providers"}>
          <SettingsProviders />
        </Match>
        <Match when={props.value() === "mcp"}>
          <SettingsMcp />
        </Match>
      </Switch>
    </div>
  )
}

export const SettingsPanel: Component = () => {
  const [section, setSection] = createSignal<SettingsSection>("general")

  return (
    <div class="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      <div class="w-[200px] min-w-[200px]">
        <SettingsNav value={section} onChange={setSection} />
      </div>
      <SettingsContent value={section} />
    </div>
  )
}

export const DialogSettings: Component = () => {
  return (
    <Dialog size="x-large" transition>
      <SettingsPanel />
    </Dialog>
  )
}
