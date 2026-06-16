import { describe, expect, test } from "bun:test"
import { validateCustomProvider } from "./dialog-custom-provider-form"

const t = (key: string) => key

describe("validateCustomProvider", () => {
  test("builds trimmed config payload", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: " Custom Provider ",
        baseURL: "https://api.example.com ",
        apiKey: " {env: CUSTOM_PROVIDER_KEY} ",
        models: [
          {
            row: "m0",
            id: " model-a ",
            name: " Model A ",
            openaiBaseURL: " https://openai.example.com/v1 ",
            anthropicBaseURL: " https://anthropic.example.com ",
            err: {},
          },
        ],
        headers: [
          { row: "h0", key: " X-Test ", value: " enabled ", err: {} },
          { row: "h1", key: "", value: "", err: {} },
        ],
        err: {},
      },
      t,
      disabledProviders: [],
      existingProviderIDs: new Set(),
    })

    expect(result.result).toEqual({
      providerID: "custom-provider",
      name: "Custom Provider",
      key: undefined,
      config: {
        npm: "@ai-sdk/openai-compatible",
        name: "Custom Provider",
        env: ["CUSTOM_PROVIDER_KEY"],
        options: {
          baseURL: "https://api.example.com",
          headers: {
            "X-Test": "enabled",
          },
        },
        models: {
          "model-a": {
            name: "Model A",
            options: {
              apiUrls: {
                openai: "https://openai.example.com/v1",
                anthropic: "https://anthropic.example.com",
              },
            },
          },
        },
      },
    })
  })

  test("flags duplicate rows and allows reconnecting disabled providers", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "https://api.example.com",
        apiKey: "secret",
        models: [
          { row: "m0", id: "model-a", name: "Model A", openaiBaseURL: "", anthropicBaseURL: "", err: {} },
          { row: "m1", id: "model-a", name: "Model A 2", openaiBaseURL: "", anthropicBaseURL: "", err: {} },
        ],
        headers: [
          { row: "h0", key: "Authorization", value: "one", err: {} },
          { row: "h1", key: "authorization", value: "two", err: {} },
        ],
        err: {},
      },
      t,
      disabledProviders: ["custom-provider"],
      existingProviderIDs: new Set(["custom-provider"]),
    })

    expect(result.result).toBeUndefined()
    expect(result.err.providerID).toBeUndefined()
    expect(result.models[1]).toEqual({
      id: "provider.custom.error.duplicate",
      name: undefined,
      openaiBaseURL: undefined,
      anthropicBaseURL: undefined,
    })
    expect(result.headers[1]).toEqual({
      key: "provider.custom.error.duplicate",
      value: undefined,
    })
  })

  test("uses anthropic provider when only anthropic model url is configured", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "anthropic-router",
        name: "Anthropic Router",
        baseURL: "https://api.example.com",
        apiKey: "secret",
        models: [
          {
            row: "m0",
            id: "claude-model",
            name: "Claude Model",
            openaiBaseURL: "",
            anthropicBaseURL: "https://anthropic.example.com",
            err: {},
          },
        ],
        headers: [],
        err: {},
      },
      t,
      disabledProviders: [],
      existingProviderIDs: new Set(),
    })

    expect(result.result?.config.models?.["claude-model"]).toEqual({
      name: "Claude Model",
      provider: {
        npm: "@ai-sdk/anthropic",
        api: "https://anthropic.example.com",
      },
      options: {
        apiUrls: {
          anthropic: "https://anthropic.example.com",
        },
      },
    })
  })
})
