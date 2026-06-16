import { describe, expect, test } from "bun:test"
import { Provider } from "../../src/provider"
import {
  externalRunCodexEventUpdate,
  externalRunCodexStreamingCommand,
  externalRunCommand,
  externalRunEnv,
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

  test("does not inject provider OpenAI env for codex", () => {
    const env: Record<string, string | undefined> = externalRunEnv(
      {
        agent: "build",
        target: "codex",
        prompt: "ping",
        model: {
          providerID: "openai" as never,
          modelID: "gpt-5.5" as never,
        },
      },
      {
        api: { id: "gpt-5.5", npm: "@ai-sdk/openai", url: "" },
        options: {},
      } as unknown as Provider.Model,
      {
        id: "openai" as never,
        name: "OpenAI",
        env: [],
        key: undefined,
        models: {},
        options: {
          baseURL: "https://example.local/v1",
          apiKey: "config-key",
        },
        source: "config",
      } as Provider.Info,
    )

    expect(env["OPENAI_BASE_URL"]).toBeUndefined()
    expect(env["OPENAI_API_BASE"]).toBeUndefined()
    expect(env["OPENAI_API_KEY"]).toBeUndefined()
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

  test("maps codex json events into streaming updates", () => {
    expect(externalRunCodexEventUpdate(JSON.stringify({ type: "turn.started" }))).toEqual({
      status: "Codex is thinking",
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
      status: "Codex is thinking",
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
      status: "Codex is writing",
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
  })
})
