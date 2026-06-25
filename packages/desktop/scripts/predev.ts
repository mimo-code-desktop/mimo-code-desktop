import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.MIMOCODE_CHANNEL ?? process.env.OPENCODE_CHANNEL ?? "dev"}`
