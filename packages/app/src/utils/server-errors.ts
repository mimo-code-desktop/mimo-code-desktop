export type ConfigInvalidError = {
  name: "ConfigInvalidError"
  data: {
    path?: string
    message?: string
    issues?: Array<{ message: string; path: string[] }>
  }
}

export type ProviderModelNotFoundError = {
  name: "ProviderModelNotFoundError"
  data: {
    providerID: string
    modelID: string
    suggestions?: string[]
  }
}

type ServerErrorLike = {
  name?: string
  message?: string
  data?: Record<string, unknown>
}

type Translator = (key: string, vars?: Record<string, string | number>) => string

function tr(
  translator: Translator | undefined,
  key: string,
  text: string,
  vars?: Record<string, string | number>,
) {
  if (!translator) return text
  const out = translator(key, vars)
  if (!out || out === key) return text
  return out
}

export function formatServerError(error: unknown, translate?: Translator, fallback?: string) {
  if (isConfigInvalidErrorLike(error)) return parseReadableConfigInvalidError(error, translate)
  if (isProviderModelNotFoundErrorLike(error)) return parseReadableProviderModelNotFoundError(error, translate)
  if (isServerErrorLike(error)) return parseReadableServerError(error, translate)
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  if (fallback) return fallback
  return tr(translate, "error.chain.unknown", "Unknown error")
}

function isConfigInvalidErrorLike(error: unknown): error is ConfigInvalidError {
  if (typeof error !== "object" || error === null) return false
  const o = error as Record<string, unknown>
  return o.name === "ConfigInvalidError" && typeof o.data === "object" && o.data !== null
}

function isProviderModelNotFoundErrorLike(error: unknown): error is ProviderModelNotFoundError {
  if (typeof error !== "object" || error === null) return false
  const o = error as Record<string, unknown>
  return o.name === "ProviderModelNotFoundError" && typeof o.data === "object" && o.data !== null
}

function isServerErrorLike(error: unknown): error is ServerErrorLike {
  if (typeof error !== "object" || error === null) return false
  const o = error as Record<string, unknown>
  return (
    typeof o.name === "string" ||
    typeof o.message === "string" ||
    (typeof o.data === "object" && o.data !== null)
  )
}

function text(value: unknown) {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return undefined
}

function parseReadableServerError(errorInput: ServerErrorLike, translator?: Translator) {
  const data = errorInput.data ?? {}
  switch (errorInput.name) {
    case "ProviderAuthError": {
      const providerID = text(data.providerID) ?? tr(translator, "common.unknown", "Unknown")
      const message = text(data.message) ?? errorInput.message ?? tr(translator, "error.chain.unknown", "Unknown error")
      return tr(translator, "error.chain.providerAuthFailed", `Provider authentication failed (${providerID}): ${message}`, {
        provider: providerID,
        message,
      })
    }
    case "ProviderInitError": {
      const providerID = text(data.providerID) ?? tr(translator, "common.unknown", "Unknown")
      return tr(translator, "error.chain.providerInitFailed", `Failed to initialize provider "${providerID}"`, {
        provider: providerID,
      })
    }
    case "APIError": {
      const lines = [text(data.message) ?? errorInput.message ?? tr(translator, "error.chain.apiError", "API error")]
      if (typeof data.statusCode === "number") {
        lines.push(tr(translator, "error.chain.status", `Status: ${data.statusCode}`, { status: data.statusCode }))
      }
      if (typeof data.isRetryable === "boolean") {
        lines.push(
          tr(translator, "error.chain.retryable", `Retryable: ${data.isRetryable}`, {
            retryable: String(data.isRetryable),
          }),
        )
      }
      if (typeof data.responseBody === "string" && data.responseBody) {
        lines.push(
          tr(translator, "error.chain.responseBody", `Response body:\n${data.responseBody}`, {
            body: data.responseBody,
          }),
        )
      }
      return lines.join("\n")
    }
  }

  return text(data.message) ?? errorInput.message ?? tr(translator, "error.chain.unknown", "Unknown error")
}

export function parseReadableConfigInvalidError(errorInput: ConfigInvalidError, translator?: Translator) {
  const file = errorInput.data.path && errorInput.data.path !== "config" ? errorInput.data.path : "config"
  const detail = errorInput.data.message?.trim() ?? ""
  const issues = (errorInput.data.issues ?? [])
    .map((issue) => {
      const msg = issue.message.trim()
      if (!issue.path.length) return msg
      return `${issue.path.join(".")}: ${msg}`
    })
    .filter(Boolean)
  const msg = issues.length ? issues.join("\n") : detail
  if (!msg) return tr(translator, "error.chain.configInvalid", `Config file at ${file} is invalid`, { path: file })
  return tr(translator, "error.chain.configInvalidWithMessage", `Config file at ${file} is invalid: ${msg}`, {
    path: file,
    message: msg,
  })
}

function parseReadableProviderModelNotFoundError(errorInput: ProviderModelNotFoundError, translator?: Translator) {
  const p = errorInput.data.providerID.trim()
  const m = errorInput.data.modelID.trim()
  const list = (errorInput.data.suggestions ?? []).map((v) => v.trim()).filter(Boolean)
  const body = tr(translator, "error.chain.modelNotFound", `Model not found: ${p}/${m}`, { provider: p, model: m })
  const tail = tr(translator, "error.chain.checkConfig", "Check your config (mimocode.json) provider/model names")
  if (list.length) {
    const suggestions = list.slice(0, 5).join(", ")
    return [body, tr(translator, "error.chain.didYouMean", `Did you mean: ${suggestions}`, { suggestions }), tail].join(
      "\n",
    )
  }
  return [body, tail].join("\n")
}
