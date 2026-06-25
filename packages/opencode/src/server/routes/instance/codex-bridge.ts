import { Provider } from "@/provider"

type BridgeConfig = {
  model: Provider.Model
  provider?: Provider.Info
  upstreamURL: string
  upstreamKey: string
  authToken: string
}

type BridgeServer = {
  baseURL: string
  authToken: string
  stop: () => Promise<void>
}

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const asString = (value: unknown) => (typeof value === "string" ? value : undefined)

const uid = () => crypto.randomUUID().replaceAll("-", "")

const isMimoProvider = (config: Pick<BridgeConfig, "model" | "provider">) => {
  const providerID = config.provider?.id ?? config.model.providerID
  const modelID = config.model.api.id.toLowerCase()
  return Boolean(
    providerID === "mimo" ||
      providerID === "xiaomi" ||
      providerID.startsWith("xiaomi-") ||
      modelID.includes("mimo") ||
      config.model.api.url.includes("xiaomimimo.com"),
  )
}

const isDeepseekProvider = (config: Pick<BridgeConfig, "model" | "provider">) => {
  const providerID = config.provider?.id ?? config.model.providerID
  return Boolean(providerID === "deepseek" || config.model.api.url.includes("api.deepseek.com"))
}

const appendOpenAIPath = (base: string, suffix: string) => {
  const url = new URL(base)
  const path = url.pathname.replace(/\/+$/, "")
  if (path.endsWith(suffix)) return url.toString()
  if (path.endsWith("/v1")) {
    url.pathname = `${path}${suffix}`
    return url.toString()
  }
  url.pathname = `${path}/v1${suffix}`
  return url.toString()
}

const normalizeInput = (input: unknown): Record<string, unknown>[] => {
  if (typeof input === "string") {
    return [{ type: "message", role: "user", content: [{ type: "input_text", text: input }] }]
  }
  if (Array.isArray(input)) return input.filter((item): item is Record<string, unknown> => !!asRecord(item))
  return []
}

const contentToChat = (content: unknown) => {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return content
  const mapped = content
    .map((block) => {
      const item = asRecord(block)
      if (!item) return
      if (item.type === "input_text" || item.type === "output_text") return { type: "text", text: item.text }
      if (item.type === "input_image") return { type: "image_url", image_url: { url: item.image_url ?? item.url } }
      return item
    })
    .filter((item): item is Record<string, unknown> => item !== undefined)
  if (mapped.length === 1 && asRecord(mapped[0])?.type === "text") return asRecord(mapped[0])?.text
  return mapped
}

const localShellTool = {
  type: "function",
  function: {
    name: "shell",
    description: "Execute a shell command on the local machine. Returns stdout, stderr and exit code.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "array",
          items: { type: "string" },
        },
        workdir: { type: "string" },
        timeout_ms: { type: "number" },
      },
      required: ["command"],
    },
  },
}

const functionTool = (item: Record<string, unknown>) => {
  if (item.function) return item
  if (typeof item.name !== "string") return
  return {
    type: "function",
    function: {
      name: item.name,
      description: item.description,
      parameters: item.parameters ?? { type: "object", properties: {} },
      ...(typeof item.strict === "boolean" ? { strict: item.strict } : {}),
    },
  }
}

const toolToChat = (tool: unknown): Record<string, unknown>[] => {
  const item = asRecord(tool)
  if (!item) return []
  if (item.type === "function") return [functionTool(item)].filter((value): value is Record<string, unknown> => !!value)
  if (item.type === "local_shell") return [localShellTool]
  if (item.type === "tool_search") {
    return [
      {
        type: "function",
        function: {
          name: "tool_search",
          description: item.description,
          parameters: item.parameters ?? { type: "object", properties: {} },
        },
      },
    ]
  }
  if (item.type === "custom" && typeof item.name === "string") {
    return [
      {
        type: "function",
        function: {
          name: item.name,
          description: item.description,
          parameters: {
            type: "object",
            properties: {
              input: { type: "string" },
            },
            additionalProperties: true,
          },
        },
      },
    ]
  }
  if (item.type === "namespace" && Array.isArray(item.tools)) return item.tools.flatMap(toolToChat)
  return []
}

const dedupeToolsByName = (tools: Record<string, unknown>[]) => {
  const seen = new Set<string>()
  return tools.filter((tool) => {
    const name = asString(asRecord(tool.function)?.name) ?? asString(tool.type)
    if (!name) return false
    const key = tool.type === "function" ? `fn:${name}` : `builtin:${name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const responsesRequestToChat = (body: Record<string, unknown>, history: Record<string, unknown>[]) => {
  const messages: Record<string, unknown>[] = []
  if (typeof body.instructions === "string" && body.instructions.trim()) {
    messages.push({ role: "user", content: `[System Instructions]\n${body.instructions}` })
  }

  const input = [...history, ...normalizeInput(body.input)]
  let pendingToolCalls: Record<string, unknown>[] = []
  const flushToolCalls = () => {
    if (pendingToolCalls.length === 0) return
    messages.push({ role: "assistant", content: null, tool_calls: pendingToolCalls })
    pendingToolCalls = []
  }

  input.forEach((item) => {
    const type = asString(item.type) ?? (typeof item.role === "string" ? "message" : undefined)
    if (type === "message") {
      flushToolCalls()
      const role = item.role === "developer" || item.role === "system" ? "user" : item.role
      messages.push({ role, content: contentToChat(item.content) })
      return
    }
    if (type === "function_call") {
      pendingToolCalls.push({
        id: item.call_id ?? item.id,
        type: "function",
        function: { name: item.name, arguments: item.arguments ?? "{}" },
      })
      return
    }
    if (type === "function_call_output") {
      flushToolCalls()
      messages.push({ role: "tool", tool_call_id: item.call_id, content: item.output })
    }
  })
  flushToolCalls()

  const request: Record<string, unknown> = {
    model: body.model,
    messages,
    stream: Boolean(body.stream),
    max_tokens: body.max_output_tokens ?? 16_384,
  }
  if (body.temperature !== undefined) request.temperature = body.temperature
  if (body.top_p !== undefined) request.top_p = body.top_p
  if (body.parallel_tool_calls !== undefined) request.parallel_tool_calls = body.parallel_tool_calls
  if (Array.isArray(body.tools)) {
    const tools = dedupeToolsByName(body.tools.flatMap(toolToChat))
    if (tools.length > 0) request.tools = tools
  }
  if (body.tool_choice !== undefined) request.tool_choice = body.tool_choice

  const effort = asString(asRecord(body.reasoning)?.effort)?.toLowerCase()
  if (effort === "none") request.thinking = { type: "disabled" }
  if (effort === "minimal") request.reasoning_effort = "low"
  if (effort && !["none", "minimal"].includes(effort)) request.reasoning_effort = effort === "xhigh" ? "high" : effort

  return request
}

const normalizeChatRequest = (request: Record<string, unknown>, config: BridgeConfig) => {
  if (isDeepseekProvider(config)) {
    delete request.parallel_tool_calls
    delete request.reasoning_effort
    delete request.thinking
    if (request.tool_choice && request.tool_choice !== "auto") delete request.tool_choice
    return request
  }
  if (!isMimoProvider(config)) return request
  const modelID = config.model.api.id.toLowerCase()
  const thinking = asRecord(request.thinking)
  if (request.parallel_tool_calls === undefined) request.parallel_tool_calls = true
  if (request.thinking === undefined && modelID !== "mimo-v2-flash") request.thinking = { type: "enabled" }
  if (asRecord(request.thinking)?.type === "enabled" && ["mimo-v2.5-pro", "mimo-v2.5"].includes(modelID)) {
    delete request.temperature
  }
  if (request.tool_choice && request.tool_choice !== "auto") delete request.tool_choice
  if (thinking?.type === "disabled" && request.reasoning_effort === "none") delete request.reasoning_effort
  return request
}

const translateUsage = (usage: Record<string, unknown> | undefined) => ({
  input_tokens: Number(usage?.prompt_tokens ?? 0),
  output_tokens: Number(usage?.completion_tokens ?? 0),
  total_tokens: Number(usage?.total_tokens ?? 0),
})

const upstreamErrorMessage = (text: string) => {
  const parsed = (() => {
    try {
      return asRecord(JSON.parse(text))
    } catch {
      return undefined
    }
  })()
  const error = asRecord(parsed?.error)
  return asString(error?.message) ?? asString(parsed?.message) ?? (text.trim() || "Upstream request failed")
}

const failedResponse = (
  body: Record<string, unknown>,
  previousResponseID: string | undefined,
  message: string,
) => ({
  id: `resp_${uid()}`,
  object: "response",
  created_at: Math.floor(Date.now() / 1000),
  status: "failed",
  model: body.model,
  output: [],
  previous_response_id: previousResponseID ?? null,
  usage: translateUsage(undefined),
  error: { type: "upstream_error", message },
})

const safeToolArguments = (value: unknown) => {
  if (typeof value !== "string") return value === undefined ? "" : JSON.stringify(value)
  if (!value) return value
  try {
    JSON.parse(value)
    return value
  } catch {
    return "{}"
  }
}

const chatCompletionToResponse = (
  body: Record<string, unknown>,
  completion: Record<string, unknown>,
  previousResponseID: string | undefined,
) => {
  const choice = asRecord((completion.choices as unknown[])?.[0])
  const message = asRecord(choice?.message)
  const reasoningContent = asString(message?.reasoning_content)
  const output = [
    ...(reasoningContent?.trim()
      ? [
          {
            type: "reasoning",
            id: `rs_${uid()}`,
            summary: [{ type: "summary_text", text: reasoningContent }],
            encrypted_content: reasoningContent,
            status: "completed",
          },
        ]
      : []),
    ...((message?.tool_calls as unknown[]) ?? []).flatMap((tool) => {
      const item = asRecord(tool)
      const fn = asRecord(item?.function)
      if (!item || !fn) return []
      return [
        {
          type: "function_call",
          id: `fc_${uid()}`,
          call_id: item.id,
          name: fn.name,
          arguments: safeToolArguments(fn.arguments) || "{}",
          status: "completed",
        },
      ]
    }),
    ...(typeof message?.content === "string" && message.content.trim()
      ? [
          {
            type: "message",
            id: `msg_${uid()}`,
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: message.content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim(), annotations: [] }],
          },
        ]
      : []),
  ]
  return {
    id: `resp_${uid()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: choice?.finish_reason === "length" ? "incomplete" : "completed",
    model: body.model ?? completion.model,
    output,
    previous_response_id: previousResponseID ?? null,
    usage: translateUsage(asRecord(completion.usage)),
  }
}

const sse = (event: string, data: Record<string, unknown>) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

type StreamToolCall = {
  id: string
  outputIndex: number
  callID: string
  name: string
  arguments: string
}

const dataLines = (chunk: string) =>
  chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean)

const chatStreamToResponses = (
  upstream: Response,
  body: Record<string, unknown>,
  previousResponseID: string | undefined,
  onResponse: (response: Record<string, unknown>) => void,
) =>
  new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const write = (event: string, data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sse(event, { type: event, ...data })))
      const response = {
        id: `resp_${uid()}`,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "in_progress",
        model: body.model,
        output: [] as Record<string, unknown>[],
        previous_response_id: previousResponseID ?? null,
        usage: translateUsage(undefined),
      }
      write("response.created", { response })
      write("response.in_progress", { response })

      let outputIndex = 0
      let message:
        | {
            id: string
            outputIndex: number
            text: string
          }
        | undefined
      let reasoning:
        | {
            id: string
            outputIndex: number
            text: string
          }
        | undefined
      const tools = new Map<number, StreamToolCall>()
      let pending = ""
      let finishReason: unknown
      let usage: Record<string, unknown> | undefined

      const openMessage = () => {
        if (message) return message
        message = { id: `msg_${uid()}`, outputIndex: outputIndex++, text: "" }
        write("response.output_item.added", {
          output_index: message.outputIndex,
          item: { type: "message", id: message.id, status: "in_progress", role: "assistant", content: [] },
        })
        write("response.content_part.added", {
          item_id: message.id,
          output_index: message.outputIndex,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
        })
        return message
      }
      const openReasoning = () => {
        if (reasoning) return reasoning
        reasoning = { id: `rs_${uid()}`, outputIndex: outputIndex++, text: "" }
        write("response.output_item.added", {
          output_index: reasoning.outputIndex,
          item: {
            type: "reasoning",
            id: reasoning.id,
            summary: [],
            encrypted_content: null,
            status: "in_progress",
          },
        })
        write("response.reasoning_summary_part.added", {
          item_id: reasoning.id,
          output_index: reasoning.outputIndex,
          summary_index: 0,
          part: { type: "summary_text", text: "" },
        })
        return reasoning
      }

      const consume = (data: string) => {
        if (data === "[DONE]") return
        const chunk = asRecord(JSON.parse(data))
        const choice = asRecord((chunk?.choices as unknown[])?.[0])
        const delta = asRecord(choice?.delta)
        finishReason = choice?.finish_reason ?? finishReason
        usage = asRecord(chunk?.usage) ?? usage

        const reasoningContent = asString(delta?.reasoning_content)
        if (reasoningContent) {
          const item = openReasoning()
          item.text += reasoningContent
          write("response.reasoning_summary_text.delta", {
            item_id: item.id,
            output_index: item.outputIndex,
            summary_index: 0,
            delta: reasoningContent,
          })
        }

        const text = asString(delta?.content)
        if (text) {
          const item = openMessage()
          item.text += text
          write("response.output_text.delta", {
            item_id: item.id,
            output_index: item.outputIndex,
            content_index: 0,
            delta: text,
          })
        }

        ;((delta?.tool_calls as Record<string, unknown>[]) ?? []).forEach((toolDelta) => {
          const index = Number(toolDelta.index ?? 0)
          const fn = asRecord(toolDelta.function)
          const current =
            tools.get(index) ??
            (() => {
              const item = {
                id: `fc_${uid()}`,
                outputIndex: outputIndex++,
                callID: asString(toolDelta.id) ?? `call_${uid()}`,
                name: asString(fn?.name) ?? "",
                arguments: "",
              }
              tools.set(index, item)
              write("response.output_item.added", {
                output_index: item.outputIndex,
                item: {
                  type: "function_call",
                  id: item.id,
                  call_id: item.callID,
                  name: item.name,
                  arguments: "",
                  status: "in_progress",
                },
              })
              return item
            })()
          current.name = asString(fn?.name) ?? current.name
          const args = asString(fn?.arguments)
          if (!args) return
          current.arguments += args
          write("response.function_call_arguments.delta", {
            item_id: current.id,
            output_index: current.outputIndex,
            call_id: current.callID,
            delta: args,
          })
        })
      }

      try {
        if (!upstream.body) throw new Error("Upstream streaming response was empty")
        const reader = upstream.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const part = await reader.read()
          if (part.done) break
          pending += decoder.decode(part.value, { stream: true })
          const events = pending.split(/\r?\n\r?\n/)
          pending = events.pop() ?? ""
          events.flatMap(dataLines).forEach(consume)
        }
        dataLines(pending).forEach(consume)

        if (reasoning) {
          write("response.reasoning_summary_text.done", {
            item_id: reasoning.id,
            output_index: reasoning.outputIndex,
            summary_index: 0,
            text: reasoning.text,
          })
          write("response.reasoning_summary_part.done", {
            item_id: reasoning.id,
            output_index: reasoning.outputIndex,
            summary_index: 0,
            part: { type: "summary_text", text: reasoning.text },
          })
          response.output.push({
            type: "reasoning",
            id: reasoning.id,
            summary: [{ type: "summary_text", text: reasoning.text }],
            encrypted_content: reasoning.text,
            status: "completed",
          })
          write("response.output_item.done", {
            output_index: reasoning.outputIndex,
            item: response.output.at(-1) ?? {},
          })
        }
        if (message) {
          const part = { type: "output_text", text: message.text, annotations: [] }
          write("response.output_text.done", {
            item_id: message.id,
            output_index: message.outputIndex,
            content_index: 0,
            text: message.text,
          })
          write("response.content_part.done", {
            item_id: message.id,
            output_index: message.outputIndex,
            content_index: 0,
            part,
          })
          response.output.push({
            type: "message",
            id: message.id,
            status: "completed",
            role: "assistant",
            content: [part],
          })
          write("response.output_item.done", {
            output_index: message.outputIndex,
            item: response.output.at(-1) ?? {},
          })
        }
        Array.from(tools.values())
          .toSorted((a, b) => a.outputIndex - b.outputIndex)
          .forEach((tool) => {
            const args = safeToolArguments(tool.arguments)
            const item = {
              type: "function_call",
              id: tool.id,
              call_id: tool.callID,
              name: tool.name,
              arguments: args || "{}",
              status: "completed",
            }
            write("response.function_call_arguments.done", {
              item_id: tool.id,
              output_index: tool.outputIndex,
              call_id: tool.callID,
              arguments: item.arguments,
            })
            response.output.push(item)
            write("response.output_item.done", {
              output_index: tool.outputIndex,
              item,
            })
          })

        response.status = finishReason === "length" ? "incomplete" : "completed"
        response.usage = translateUsage(usage)
        onResponse(response)
        write("response.completed", { response })
        controller.close()
      } catch (err) {
        const failed = {
          ...response,
          status: "failed",
          error: { type: "upstream_error", message: err instanceof Error ? err.message : String(err) },
        }
        write("response.failed", { response: failed })
        controller.close()
      }
    },
  })

export async function startCodexBridge(config: BridgeConfig): Promise<BridgeServer> {
  const history = new Map<string, Record<string, unknown>[]>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === "/health") return Response.json({ ok: true })
      if (req.headers.get("authorization") !== `Bearer ${config.authToken}`) {
        return Response.json({ error: { message: "Unauthorized" } }, { status: 401 })
      }
      if (req.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/models")) {
        return Response.json({ object: "list", data: [{ id: config.model.api.id, object: "model", owned_by: config.provider?.id ?? "custom" }] })
      }
      if (req.method !== "POST" || !["/v1/responses", "/responses"].includes(url.pathname)) {
        return Response.json({ error: { message: "Not found" } }, { status: 404 })
      }

      const body = (await req.json()) as Record<string, unknown>
      body.model = config.model.api.id
      const previousResponseID = asString(body.previous_response_id)
      const chatRequest = normalizeChatRequest(
        responsesRequestToChat(body, previousResponseID ? history.get(previousResponseID) ?? [] : []),
        config,
      )
      const upstream = await fetch(appendOpenAIPath(config.upstreamURL, "/chat/completions"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.upstreamKey}`,
        },
        body: JSON.stringify(chatRequest),
      })
      if (!upstream.ok) {
        const response = failedResponse(
          body,
          previousResponseID,
          `DeepSeek/API returned HTTP ${upstream.status}: ${upstreamErrorMessage(await upstream.text())}`,
        )
        if (body.stream) {
          return new Response(sse("response.failed", { type: "response.failed", response }), {
            headers: { "content-type": "text/event-stream" },
          })
        }
        return Response.json(response)
      }

      const saveResponse = (response: Record<string, unknown>) => {
        history.set(response.id as string, [
          ...(previousResponseID ? history.get(previousResponseID) ?? [] : []),
          ...normalizeInput(body.input),
          ...((response.output as Record<string, unknown>[]) ?? []),
        ])
      }

      if (body.stream) {
        return new Response(chatStreamToResponses(upstream, body, previousResponseID, saveResponse), {
          headers: { "content-type": "text/event-stream" },
        })
      }

      const response = chatCompletionToResponse(body, (await upstream.json()) as Record<string, unknown>, previousResponseID)
      saveResponse(response)
      return Response.json(response)
    },
  })
  return {
    baseURL: `${server.url.origin}/v1`,
    authToken: config.authToken,
    stop: async () => server.stop(true),
  }
}
