import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))
const ghosttyWeb = (() => {
  const workspace = fileURLToPath(new URL("./node_modules/ghostty-web/dist/ghostty-web.js", import.meta.url))
  if (existsSync(workspace)) return workspace

  const bun = fileURLToPath(new URL("../../node_modules/.bun", import.meta.url))
  if (!existsSync(bun)) return workspace

  return (
    readdirSync(bun)
      .filter((entry) => entry.startsWith("ghostty-web@"))
      .map((entry) => path.join(bun, entry, "node_modules", "ghostty-web", "dist", "ghostty-web.js"))
      .find((entry) => existsSync(entry)) ?? workspace
  )
})()

/**
 * @type {import("vite").PluginOption}
 */
export default [
  {
    name: "opencode-desktop:config",
    config() {
      return {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            "ghostty-web": ghosttyWeb,
          },
        },
        worker: {
          format: "es",
        },
      }
    },
  },
  {
    name: "opencode-desktop:theme-preload",
    transformIndexHtml(html) {
      return html.replace(
        '<script id="oc-theme-preload-script" src="/oc-theme-preload.js"></script>',
        `<script id="oc-theme-preload-script">${readFileSync(theme, "utf8")}</script>`,
      )
    },
  },
  tailwindcss(),
  solidPlugin(),
]
