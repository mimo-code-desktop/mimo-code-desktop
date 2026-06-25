import { describe, expect, test } from "bun:test"
import { Provider } from "../../src/provider"
import { startCodexBridge } from "../../src/server/routes/instance/codex-bridge"
import {
  externalRunCodexConfig,
  externalRunCodexEventUpdate,
  externalRunCodexStreamingCommand,
  externalRunClaudeEventUpdate,
  externalRunCommand,
  externalRunEnv,
  externalRunOpencodeEventUpdate,
  externalRunOpencodeStreamingCommand,
} from "../../src/server/routes/instance/session"

describe("externalRunEnv", () => {
  test("does not override the local codex model_provider", () => {
    expect(
      externalRunCommand(
        {
          agent: "build",
          target: "codex",
          prompt: "ping",
          model: {
            providerID: "openai" as never,
            modelID: "gpt-5.5" as never,
          },
        },
        { directory: "/tmp/project" },
      ),
    ).not.toContain("model_provider")
  })

  test("configures a local responses bridge for chat-only codex providers", () => {
    const input = {
      agent: "build",
      target: "codex" as const,
      prompt: "ping",
      model: {
        providerID: "deepseek" as never,
        modelID: "deepseek-chat" as never,
      },
    }
    const model = {
      api: { id: "deepseek-chat", npm: "@ai-sdk/deepseek", url: "https://api.deepseek.com" },
      options: {},
      providerID: "deepseek" as never,
    } as unknown as Provider.Model
    const provider = {
      id: "deepseek" as never,
      name: "DeepSeek",
      env: [],
      key: undefined,
      models: {},
      options: {
        apiKey: "config-key",
      },
      source: "config",
    } as Provider.Info

    const config = externalRunCodexConfig(input, {
      directory: "/tmp/project",
      model,
      provider,
      codexBridge: {
        baseURL: "http://127.0.0.1:4321/v1",
        authToken: "bridge-key",
      },
    })

    expect(config).toContain(
      'model_providers.mimocode_external.base_url="http://127.0.0.1:4321/v1"',
    )
    expect(config).toContain(
      'model_providers.mimocode_external.wire_api="responses"',
    )
    expect(config).toContain(
      'model_providers.mimocode_external.env_key="MIMOCODE_EXTERNAL_API_KEY"',
    )

    const env: Record<string, string | undefined> = externalRunEnv(input, model, provider)

    expect(env["MIMOCODE_EXTERNAL_API_KEY"]).toBe("config-key")
  })

  test("requires codex bridge for MiMo-compatible chat providers", () => {
    expect(
      Provider.codexBridgeRequired(
        {
          api: { id: "mimo-v2.5-pro", npm: "@ai-sdk/openai-compatible", url: "https://api.xiaomimimo.com/v1" },
          options: {},
          providerID: "mimo" as never,
        } as unknown as Provider.Model,
      ),
    ).toBe(true)
    expect(
      Provider.codexBridgeRequired(
        {
          api: { id: "mimo-v2.5-pro", npm: "@ai-sdk/openai-compatible", url: "https://token-plan-sgp.xiaomimimo.com/v1" },
          options: {},
          providerID: "xiaomi-token-plan-sgp" as never,
        } as unknown as Provider.Model,
      ),
    ).toBe(true)
  })

  test("translates codex responses requests to chat completions", async () => {
    let upstreamBody: Record<string, unknown> | undefined
    let upstreamPath = ""
    const upstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        upstreamPath = new URL(req.url).pathname
        upstreamBody = (await req.json()) as Record<string, unknown>
        return Response.json({
          id: "chatcmpl_test",
          object: "chat.completion",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: "pong",
              },
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        })
      },
    })
    const bridge = await startCodexBridge({
      model: {
        api: { id: "deepseek-chat", npm: "@ai-sdk/deepseek", url: upstream.url.origin },
        options: {},
        providerID: "deepseek" as never,
      } as unknown as Provider.Model,
      upstreamURL: upstream.url.origin,
      upstreamKey: "upstream-key",
      authToken: "bridge-key",
    })

    try {
      const res = await fetch(`${bridge.baseURL}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer bridge-key",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          input: "ping",
          max_output_tokens: 5,
          parallel_tool_calls: true,
          reasoning: { effort: "high" },
          store: false,
        }),
      })
      const body = (await res.json()) as Record<string, unknown>
      const output = body.output as Array<{ content?: Array<{ text?: string }> }>

      expect(res.ok).toBe(true)
      expect(upstreamPath).toBe("/v1/chat/completions")
      expect(upstreamBody?.model).toBe("deepseek-chat")
      expect(upstreamBody?.max_tokens).toBe(5)
      expect(upstreamBody?.parallel_tool_calls).toBeUndefined()
      expect(upstreamBody?.reasoning_effort).toBeUndefined()
      expect(upstreamBody?.thinking).toBeUndefined()
      expect(upstreamBody?.messages).toEqual([{ role: "user", content: "ping" }])
      expect(output[0]?.content?.[0]?.text).toBe("pong")
    } finally {
      await bridge.stop()
      upstream.stop(true)
    }
  })

  test("returns response.failed events for codex bridge upstream errors", async () => {
    const upstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return Response.json({ error: { message: "bad auth" } }, { status: 401 })
      },
    })
    const bridge = await startCodexBridge({
      model: {
        api: { id: "deepseek-chat", npm: "@ai-sdk/deepseek", url: upstream.url.origin },
        options: {},
        providerID: "deepseek" as never,
      } as unknown as Provider.Model,
      upstreamURL: upstream.url.origin,
      upstreamKey: "upstream-key",
      authToken: "bridge-key",
    })

    try {
      const res = await fetch(`${bridge.baseURL}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer bridge-key",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          input: "ping",
          stream: true,
        }),
      })
      const text = await res.text()

      expect(res.ok).toBe(true)
      expect(text).toContain("response.failed")
      expect(text).toContain("DeepSeek/API returned HTTP 401: bad auth")
    } finally {
      await bridge.stop()
      upstream.stop(true)
    }
  })

  test("streams codex responses through MiMo chat completions", async () => {
    let upstreamBody: Record<string, unknown> | undefined
    const upstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        upstreamBody = (await req.json()) as Record<string, unknown>
        return new Response(
          [
            'data: {"choices":[{"index":0,"delta":{"reasoning_content":"thinking"},"finish_reason":null}]}\n\n',
            'data: {"choices":[{"index":0,"delta":{"content":"pong"},"finish_reason":null}]}\n\n',
            'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
            "data: [DONE]\n\n",
          ].join(""),
          {
            headers: { "content-type": "text/event-stream" },
          },
        )
      },
    })
    const bridge = await startCodexBridge({
      model: {
        api: { id: "mimo-v2.5-pro", npm: "@ai-sdk/openai-compatible", url: upstream.url.origin },
        options: {},
        providerID: "mimo" as never,
      } as unknown as Provider.Model,
      upstreamURL: upstream.url.origin,
      upstreamKey: "upstream-key",
      authToken: "bridge-key",
    })

    try {
      const res = await fetch(`${bridge.baseURL}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer bridge-key",
        },
        body: JSON.stringify({
          model: "mimo-v2.5-pro",
          input: "ping",
          stream: true,
          temperature: 0.2,
        }),
      })
      const text = await res.text()

      expect(res.ok).toBe(true)
      expect(upstreamBody?.stream).toBe(true)
      expect(upstreamBody?.parallel_tool_calls).toBe(true)
      expect(upstreamBody?.thinking).toEqual({ type: "enabled" })
      expect(upstreamBody?.temperature).toBeUndefined()
      expect(text).toContain("response.reasoning_summary_text.delta")
      expect(text).toContain("response.output_text.delta")
      expect(text).toContain("pong")
      expect(text).toContain("response.completed")
    } finally {
      await bridge.stop()
      upstream.stop(true)
    }
  })

  test("runs codex with json events and final output file", () => {
    expect(
      externalRunCodexStreamingCommand(
        {
          agent: "build",
          target: "codex",
          prompt: "ping",
          model: {
            providerID: "openai" as never,
            modelID: "gpt-5.5" as never,
          },
        },
        { directory: "/tmp/project", outputFile: "/tmp/codex-output.txt" },
      ),
    ).toEqual([
      "codex",
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "-m",
      "gpt-5.5",
      "-C",
      "/tmp/project",
      "--json",
      "--output-last-message",
      "/tmp/codex-output.txt",
      "ping",
    ])
  })

  test("runs opencode with json events", () => {
    expect(
      externalRunOpencodeStreamingCommand(
        {
          agent: "build",
          target: "opencode",
          prompt: "ping",
          model: {
            providerID: "mimo" as never,
            modelID: "mimo-auto" as never,
          },
          variant: "high",
        },
        { directory: "/tmp/project" },
      ),
    ).toEqual([
      "opencode",
      "run",
      "--format",
      "json",
      "--dangerously-skip-permissions",
      "--model",
      "mimo/mimo-auto",
      "--agent",
      "build",
      "--dir",
      "/tmp/project",
      "--variant",
      "high",
      "ping",
    ])
  })

  test("maps codex json events into streaming updates", () => {
    expect(externalRunCodexEventUpdate(JSON.stringify({ type: "turn.started" }))).toEqual({
      status: "Thinking",
    })
    expect(
      externalRunCodexEventUpdate(
        JSON.stringify({
          type: "item.completed",
          item: { type: "reasoning", text: "checking files" },
        }),
      ),
    ).toEqual({
      reasoning: "checking files",
      status: "Thinking",
    })
    expect(
      externalRunCodexEventUpdate(
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: "done" },
        }),
      ),
    ).toEqual({
      text: "done",
      status: "Writing",
    })
  })

  test("maps claude stream-json events into streaming updates", () => {
    expect(
      externalRunClaudeEventUpdate(
        JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: "done" }] },
        }),
      ),
    ).toEqual({
      text: "done",
      status: "Writing",
    })
    expect(
      externalRunClaudeEventUpdate(
        JSON.stringify({
          type: "result",
          result: "final",
        }),
      ),
    ).toEqual({
      text: "final",
      status: "Finished",
    })
  })


  test("maps opencode json events into streaming updates", () => {
    expect(
      externalRunOpencodeEventUpdate(
        JSON.stringify({
          type: "text",
          part: { type: "text", text: "done" },
        }),
      ),
    ).toEqual({
      text: "done",
      status: "Writing",
    })
    expect(
      externalRunOpencodeEventUpdate(
        JSON.stringify({
          type: "tool_use",
          part: { tool: "bash" },
        }),
      ),
    ).toEqual({
      status: "Using bash",
    })
  })

  test("uses provider config baseURL and apiKey for claude", () => {
    const env: Record<string, string | undefined> = externalRunEnv(
      {
        agent: "build",
        target: "claude",
        prompt: "ping",
        model: {
          providerID: "anthropic" as never,
          modelID: "claude-sonnet-4-5" as never,
        },
      },
      {
        api: { id: "claude-sonnet-4-5", npm: "@ai-sdk/anthropic", url: "" },
        options: {
          apiUrls: {
            anthropic: "https://example.local/anthropic",
          },
        },
      } as unknown as Provider.Model,
      {
        id: "anthropic" as never,
        name: "Anthropic",
        env: [],
        key: undefined,
        models: {},
        options: {
          apiKey: "config-key",
        },
        source: "config",
      } as Provider.Info,
    )

    expect(env["ANTHROPIC_BASE_URL"]).toBe("https://example.local/anthropic")
    expect(env["ANTHROPIC_API_URL"]).toBe("https://example.local/anthropic")
    expect(env["ANTHROPIC_API_KEY"]).toBe("config-key")
    expect(env["ANTHROPIC_MODEL"]).toBe("claude-sonnet-4-5")
    expect(env["CLAUDE_CODE_SUBAGENT_MODEL"]).toBe("claude-sonnet-4-5")
  })

  test("uses DeepSeek Anthropic compatibility settings for claude", () => {
    const input = {
      agent: "build",
      target: "claude" as const,
      prompt: "ping",
      model: {
        providerID: "deepseek" as never,
        modelID: "deepseek-v4-pro" as never,
      },
    }
    const model = {
      api: { id: "deepseek-v4-pro[1m]", npm: "@ai-sdk/deepseek", url: "https://api.deepseek.com" },
      options: {},
      providerID: "deepseek" as never,
    } as unknown as Provider.Model
    const provider = {
      id: "deepseek" as never,
      name: "DeepSeek",
      env: [],
      key: undefined,
      models: {},
      options: {
        apiKey: "config-key",
      },
      source: "config",
    } as Provider.Info

    expect(externalRunCommand(input, { directory: "/tmp/project", model, provider })).toEqual([
      "claude",
      "-p",
      "--dangerously-skip-permissions",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "ping",
    ])

    const env: Record<string, string | undefined> = externalRunEnv(
      input,
      model,
      provider,
    )

    expect(env["ANTHROPIC_BASE_URL"]).toBe("https://api.deepseek.com/anthropic")
    expect(env["ANTHROPIC_API_URL"]).toBe("https://api.deepseek.com/anthropic")
    expect(env["ANTHROPIC_API_KEY"]).toBe("config-key")
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBe("config-key")
    expect(env["ANTHROPIC_MODEL"]).toBe("deepseek-v4-pro[1m]")
    expect(env["ANTHROPIC_DEFAULT_OPUS_MODEL"]).toBe("deepseek-v4-pro[1m]")
    expect(env["ANTHROPIC_DEFAULT_SONNET_MODEL"]).toBe("deepseek-v4-pro[1m]")
    expect(env["ANTHROPIC_DEFAULT_HAIKU_MODEL"]).toBe("deepseek-v4-flash")
    expect(env["CLAUDE_CODE_SUBAGENT_MODEL"]).toBe("deepseek-v4-flash")
    expect(env["CLAUDE_CODE_EFFORT_LEVEL"]).toBe("max")
  })
})
