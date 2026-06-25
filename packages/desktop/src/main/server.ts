import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import path from "node:path"
import { app } from "electron"
import { DEFAULT_SERVER_URL_KEY, RENDERER_ORIGIN, WSL_ENABLED_KEY } from "./constants"
import { getUserShell, loadShellEnv } from "./shell-env"
import { getStore } from "./store"

export type WslConfig = { enabled: boolean }

export type HealthCheck = { wait: Promise<void> }
export type LocalServerListener = { stop: () => void }

export const SIDECAR_USERNAME = "opencode"

export function getDefaultServerUrl(): string | null {
  const value = getStore().get(DEFAULT_SERVER_URL_KEY)
  return typeof value === "string" ? value : null
}

export function setDefaultServerUrl(url: string | null) {
  if (url) {
    getStore().set(DEFAULT_SERVER_URL_KEY, url)
    return
  }

  getStore().delete(DEFAULT_SERVER_URL_KEY)
}

export function getWslConfig(): WslConfig {
  const value = getStore().get(WSL_ENABLED_KEY)
  return { enabled: typeof value === "boolean" ? value : false }
}

export function setWslConfig(config: WslConfig) {
  getStore().set(WSL_ENABLED_KEY, config.enabled)
}

export async function spawnLocalServer(hostname: string, port: number, password: string) {
  const env = prepareServerEnv(password)
  const command = serverCommand(env)
  const child = spawn(command.cmd, [...command.args, "serve", "--hostname", hostname, "--port", String(port), "--cors", RENDERER_ORIGIN], {
    env,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  })
  const output = collectOutput(child)

  const wait = (async () => {
    const url = `http://${hostname}:${port}`
    const exited = new Promise<never>((_, reject) => {
      child.once("error", (error) => {
        reject(new Error(`Failed to start ${command.cmd}: ${error.message}`))
      })
      child.once("exit", (code, signal) => {
        reject(new Error(`${command.cmd} serve exited with ${signal ?? `code ${code ?? 0}`}${output()}`))
      })
    })

    const ready = async () => {
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        if (await checkHealth(url, password)) return
      }
    }

    await Promise.race([ready(), exited])
  })()

  return {
    listener: {
      stop() {
        if (child.killed) return
        child.kill()
      },
    } satisfies LocalServerListener,
    health: { wait },
  }
}

function serverCommand(env: NodeJS.ProcessEnv) {
  if (env.MIMOCODE_BIN_PATH) return { cmd: env.MIMOCODE_BIN_PATH, args: [] }
  if (app.isPackaged) return { cmd: "mimo", args: [] }

  return {
    cmd: "bun",
    args: ["run", "--cwd", path.resolve(app.getAppPath(), "../opencode"), "--conditions=browser", "src/index.ts"],
  }
}

function prepareServerEnv(password: string): NodeJS.ProcessEnv {
  const shell = process.platform === "win32" ? null : getUserShell()
  const shellEnv = shell ? (loadShellEnv(shell) ?? {}) : {}
  return {
    ...process.env,
    ...shellEnv,
    MIMOCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    MIMOCODE_EXPERIMENTAL_FILEWATCHER: "true",
    MIMOCODE_CLIENT: "desktop",
    MIMOCODE_SERVER_USERNAME: SIDECAR_USERNAME,
    MIMOCODE_SERVER_PASSWORD: password,
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_CLIENT: "desktop",
    OPENCODE_SERVER_USERNAME: SIDECAR_USERNAME,
    OPENCODE_SERVER_PASSWORD: password,
    XDG_STATE_HOME: app.getPath("userData"),
  }
}

function collectOutput(child: ChildProcess) {
  let output = ""
  const append = (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`
    if (output.length > 4000) output = output.slice(-4000)
  }

  child.stdout?.on("data", append)
  child.stderr?.on("data", append)

  return () => (output.trim() ? `\n${output.trim()}` : "")
}

export async function checkHealth(url: string, password?: string | null): Promise<boolean> {
  let healthUrl: URL
  try {
    healthUrl = new URL("/global/health", url)
  } catch {
    return false
  }

  const headers = new Headers()
  if (password) {
    const auth = Buffer.from(`${SIDECAR_USERNAME}:${password}`).toString("base64")
    headers.set("authorization", `Basic ${auth}`)
  }

  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}
