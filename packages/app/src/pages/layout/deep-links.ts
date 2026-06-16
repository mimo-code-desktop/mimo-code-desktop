export const deepLinkEvent = "mimocode:deep-link"

const supportedProtocols = new Set(["mimocode:", "opencode:"])

const parseUrl = (input: string) => {
  if (typeof URL.canParse === "function" && !URL.canParse(input)) return
  try {
    const url = new URL(input)
    if (!supportedProtocols.has(url.protocol)) return
    return url
  } catch {
    return
  }
}

export const parseDeepLink = (input: string) => {
  const url = parseUrl(input)
  if (!url) return
  if (url.hostname !== "open-project") return
  const directory = url.searchParams.get("directory")
  if (!directory) return
  return directory
}

export const parseNewSessionDeepLink = (input: string) => {
  const url = parseUrl(input)
  if (!url) return
  if (url.hostname !== "new-session") return
  const directory = url.searchParams.get("directory")
  if (!directory) return
  const prompt = url.searchParams.get("prompt") || undefined
  if (!prompt) return { directory }
  return { directory, prompt }
}

export const collectOpenProjectDeepLinks = (urls: string[]) =>
  urls.map(parseDeepLink).filter((directory): directory is string => !!directory)

export const collectNewSessionDeepLinks = (urls: string[]) =>
  urls.map(parseNewSessionDeepLink).filter((link): link is { directory: string; prompt?: string } => !!link)

type MiMoCodeWindow = Window & {
  __MIMOCODE__?: {
    deepLinks?: string[]
  }
  __OPENCODE__?: {
    deepLinks?: string[]
  }
}

export const drainPendingDeepLinks = (target: MiMoCodeWindow) => {
  const pending = Array.from(
    new Set([...(target.__MIMOCODE__?.deepLinks ?? []), ...(target.__OPENCODE__?.deepLinks ?? [])]),
  )
  if (pending.length === 0) return []
  if (target.__MIMOCODE__) target.__MIMOCODE__.deepLinks = []
  if (target.__OPENCODE__) target.__OPENCODE__.deepLinks = []
  return pending
}
