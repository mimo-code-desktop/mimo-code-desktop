import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

const channel = (() => {
  const raw = process.env.MIMOCODE_CHANNEL ?? process.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const macSigningEnabled = process.env.MIMOCODE_MAC_SIGN === "true"

const getBase = (): Configuration => ({
  artifactName: "mimo-code-desktop-${version}-${os}-${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: ["out/**/*", "resources/**/*"],
  extraResources: [
    {
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    identity: macSigningEnabled ? undefined : null,
    hardenedRuntime: macSigningEnabled,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: macSigningEnabled,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: macSigningEnabled,
  },
  protocols: {
    name: "MiMo Code",
    schemes: ["mimocode"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    signtoolOptions: {
      sign: signWindows,
    },
    target: ["nsis"],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    target: ["AppImage", "deb", "rpm"],
  },
})

function getConfig() {
  const base = getBase()

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId: "ai.mimocode.desktop.dev",
        productName: "MiMo Code Dev",
        rpm: { packageName: "mimo-code-dev" },
      }
    }
    case "beta": {
      return {
        ...base,
        appId: "ai.mimocode.desktop.beta",
        productName: "MiMo Code Beta",
        protocols: { name: "MiMo Code Beta", schemes: ["mimocode"] },
        rpm: { packageName: "mimo-code-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId: "ai.mimocode.desktop",
        productName: "MiMo Code",
        protocols: { name: "MiMo Code", schemes: ["mimocode"] },
        rpm: { packageName: "mimo-code" },
      }
    }
  }
}

export default getConfig()
