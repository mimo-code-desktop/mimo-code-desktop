import { app } from "electron"

export type Channel = "dev" | "beta" | "prod"

const raw = import.meta.env.MIMOCODE_CHANNEL || import.meta.env.OPENCODE_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const APP_NAMES: Record<Channel, string> = {
  dev: "MiMo Code Dev",
  beta: "MiMo Code Beta",
  prod: "MiMo Code",
}

export const APP_IDS: Record<Channel, string> = {
  dev: "ai.mimocode.desktop.dev",
  beta: "ai.mimocode.desktop.beta",
  prod: "ai.mimocode.desktop",
}

export const APP_NAME = app.isPackaged ? APP_NAMES[CHANNEL] : APP_NAMES.dev
export const APP_ID = app.isPackaged ? APP_IDS[CHANNEL] : APP_IDS.dev
export const APP_PROTOCOL = "mimocode"
export const APP_LEGACY_PROTOCOL = "opencode"
export const APP_REPOSITORY_URL = "https://github.com/mimo-code-desktop/mimo-code-desktop"

export const RENDERER_PROTOCOL = "mimocode-app"
export const RENDERER_HOST = "renderer"
export const RENDERER_ORIGIN = `${RENDERER_PROTOCOL}://${RENDERER_HOST}`

export const SETTINGS_STORE = "mimocode.settings"
export const DEFAULT_SERVER_URL_KEY = "defaultServerUrl"
export const WSL_ENABLED_KEY = "wslEnabled"
export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev" && process.env.MIMOCODE_ENABLE_UPDATER === "true"
