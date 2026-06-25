import { execFile } from "node:child_process"
import { getUserShell, isNushell, parseShellEnv } from "./shell-env"
import type { ProgrammingAgentId, ProgrammingAgentsResult, ProgrammingAgentStatus } from "../preload/types"

const TIMEOUT = 8_000
const UPDATE_TIMEOUT = 120_000
const SHELL_ENV_TIMEOUT = 5_000

const agents = [
  {
    id: "mimo",
    name: "MiMo Code",
    commands: ["mimo", "mimocode"],
    packageName: "@mimo-ai/cli",
    installUrl: "https://mimo.xiaomi.com/install",
    updateArgs: ["upgrade"],
  },
  {
    id: "codex",
    name: "Codex",
    commands: ["codex"],
    packageName: "@openai/codex",
    installUrl: "https://developers.openai.com/codex/cli",
  },
  {
    id: "claude",
    name: "Claude Code",
    commands: ["claude"],
    packageName: "@anthropic-ai/claude-code",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/setup",
    updateArgs: ["update"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    commands: ["opencode"],
    packageName: "opencode-ai",
    installUrl: "https://opencode.ai/docs",
    updateArgs: ["upgrade"],
  },
] as const

type Agent = (typeof agents)[number]
type ExecResult = { stdout: string; stderr: string }
type ExecFailure = Error & { stdout?: string; stderr?: string }
type UpdateCommand = { command: string; args: readonly string[] }
type UpdateFailure = { command: string; message: string }

let cache: ProgrammingAgentStatus[] | undefined
let inFlight: Promise<void> | undefined
let shellEnv: Promise<Record<string, string> | null> | undefined
const updates = new Map<ProgrammingAgentId, Promise<void>>()

export async function getProgrammingAgents(options?: { refresh?: boolean }): Promise<ProgrammingAgentsResult> {
  if (!cache || options?.refresh) refresh()
  return {
    agents: cache ?? agents.map((agent) => baseStatus(agent)),
    refreshing: Boolean(inFlight),
  }
}

export function refreshProgrammingAgents() {
  refresh()
}

export function updateProgrammingAgent(id: ProgrammingAgentId) {
  const existing = updates.get(id)
  if (existing) return existing

  const agent = agents.find((agent) => agent.id === id)
  if (!agent) return Promise.reject(new Error(`Unknown programming agent: ${id}`))

  const task = updateAgent(agent).finally(() => {
    updates.delete(id)
  })
  updates.set(id, task)
  return task
}

function refresh() {
  if (inFlight) return
  inFlight = refreshAgents()
    .catch(() => undefined)
    .finally(() => {
      inFlight = undefined
    })
}

async function refreshAgents() {
  const env = await loadAgentEnv()
  cache = await Promise.all(agents.map((agent) => status(agent, env)))
}

async function loadAgentEnv() {
  const shell = process.platform === "win32" ? null : getUserShell()
  return {
    ...process.env,
    ...(shell ? ((await loadShellEnvAsync(shell)) ?? {}) : {}),
  }
}

async function updateAgent(agent: Agent) {
  if (inFlight) await inFlight
  const env = await loadAgentEnv()
  await runFirstSuccessful(updateCommands(agent, await resolveCommand(agent.commands, env)), env)
  cache = await Promise.all(agents.map((agent) => status(agent, env)))
}

function baseStatus(agent: Agent): ProgrammingAgentStatus {
  return {
    id: agent.id,
    name: agent.name,
    command: agent.commands[0],
    packageName: agent.packageName,
    installUrl: agent.installUrl,
    installed: false,
    update: "unknown",
  }
}

async function status(agent: Agent, env: NodeJS.ProcessEnv): Promise<ProgrammingAgentStatus> {
  const [path, latestVersion] = await Promise.all([
    resolveCommand(agent.commands, env),
    latestPackageVersion(agent.packageName),
  ])
  const currentVersion = path ? await installedVersion(path, env) : undefined
  const installed = Boolean(path)
  const update = updateStatus(installed, currentVersion, latestVersion)

  return {
    id: agent.id,
    name: agent.name,
    command: agent.commands[0],
    path,
    packageName: agent.packageName,
    installUrl: agent.installUrl,
    installed,
    currentVersion,
    latestVersion,
    update,
  }
}

function loadShellEnvAsync(shell: string) {
  shellEnv ??= probeShellEnv(shell)
  return shellEnv
}

async function probeShellEnv(shell: string) {
  if (isNushell(shell)) return null

  const interactive = await probe(shell, "-il")
  if (interactive) return interactive

  return probe(shell, "-l")
}

async function probe(shell: string, mode: "-il" | "-l") {
  const result = await exec(shell, [mode, "-c", "env -0"], process.env, SHELL_ENV_TIMEOUT).catch(() => undefined)
  if (!result) return null

  const env = parseShellEnv(Buffer.from(result.stdout))
  if (Object.keys(env).length === 0) return null
  return env
}

async function resolveCommand(commands: readonly string[], env: NodeJS.ProcessEnv) {
  const resolved = await Promise.all(commands.map((command) => commandPath(command, env)))
  return resolved.find((path): path is string => Boolean(path))
}

async function commandPath(command: string, env: NodeJS.ProcessEnv) {
  const result =
    process.platform === "win32"
      ? await exec("where", [command], env).catch(() => undefined)
      : await exec("which", [command], env).catch(() => undefined)
  return result?.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
}

async function installedVersion(command: string, env: NodeJS.ProcessEnv) {
  const result = await exec(command, ["--version"], env).catch(() => undefined)
  return versionFromText(`${result?.stdout ?? ""}\n${result?.stderr ?? ""}`)
}

async function latestPackageVersion(packageName: string) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch(() => undefined)
  if (!response?.ok) return

  const body = (await response.json().catch(() => undefined)) as unknown
  if (!body || typeof body !== "object") return
  const tags = (body as { "dist-tags"?: unknown })["dist-tags"]
  if (!tags || typeof tags !== "object") return
  const latest = (tags as { latest?: unknown }).latest
  if (typeof latest !== "string") return
  return latest
}

function exec(command: string, args: readonly string[], env: NodeJS.ProcessEnv, timeout = TIMEOUT) {
  return new Promise<ExecResult>((resolve, reject) => {
    execFile(command, args, { env, timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const failure = error as ExecFailure
        failure.stdout = stdout
        failure.stderr = stderr
        reject(failure)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

function versionFromText(text: string) {
  return text.match(/\bv?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/)?.[1]
}

function updateStatus(installed: boolean, currentVersion: string | undefined, latestVersion: string | undefined) {
  if (!installed) return latestVersion ? "not_installed" : "unknown"
  if (!currentVersion) return "unknown"
  if (!latestVersion) return "unknown"
  return compareVersion(currentVersion, latestVersion) < 0 ? "outdated" : "latest"
}

function updateCommands(agent: Agent, path: string | undefined): UpdateCommand[] {
  return [
    ...(path && "updateArgs" in agent ? [{ command: path, args: agent.updateArgs }] : []),
    {
      command: process.platform === "win32" ? "npm.cmd" : "npm",
      args: ["install", "-g", `${agent.packageName}@latest`],
    },
  ]
}

async function runFirstSuccessful(commands: UpdateCommand[], env: NodeJS.ProcessEnv) {
  const result = await commands.reduce<Promise<"updated" | UpdateFailure[]>>(async (previous, command) => {
    const failures = await previous
    if (failures === "updated") return failures

    const result = await exec(command.command, command.args, env, UPDATE_TIMEOUT)
      .then(() => "updated" as const)
      .catch((err: unknown): UpdateFailure => ({
        command: [command.command, ...command.args].join(" "),
        message: execErrorMessage(err),
      }))

    if (result === "updated") return result
    return [...failures, result]
  }, Promise.resolve([]))

  if (result === "updated") return
  throw new Error(result.map((failure) => `${failure.command}\n${failure.message}`).join("\n\n"))
}

function execErrorMessage(err: unknown) {
  if (!(err instanceof Error)) return String(err)
  const failure = err as ExecFailure
  return [failure.message, failure.stderr, failure.stdout].filter(Boolean).join("\n").trim()
}

function compareVersion(a: string, b: string) {
  const left = numericVersion(a)
  const right = numericVersion(b)
  return left.reduce((result, value, index) => {
    if (result !== 0) return result
    return value === right[index] ? 0 : value > right[index] ? 1 : -1
  }, 0)
}

function numericVersion(version: string) {
  return version
    .replace(/^v/, "")
    .split(/[+-]/)[0]
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0)
}
