# MiMo Code Desktop Implementation Plan

## Architecture

- Keep the upstream MiMo-Code monorepo shape so workspace dependencies, server build artifacts, and Electron Vite plugins continue to resolve normally.
- Use `packages/desktop` as the desktop shell. The main process starts the bundled sidecar, exposes `window.api` through preload, and serves renderer assets through `mimocode-app://renderer`.
- Use `packages/app` for the shared coding UI. Desktop passes sidecar credentials into `AppInterface` and dispatches native menu/deep-link events into the existing command system.

## Desktop Identity

- App names: `MiMo Code Dev`, `MiMo Code Beta`, `MiMo Code`.
- App IDs: `ai.mimocode.desktop.dev`, `ai.mimocode.desktop.beta`, `ai.mimocode.desktop`.
- External protocol: `mimocode://`.
- Artifact name: `mimo-code-desktop-${os}-${arch}.${ext}`.
- Settings store: `mimocode.settings`; legacy Tauri/OpenCode settings migrate into this store when present.

## Build And Packaging

- Install dependencies with `bun install`.
- Run desktop dev mode with `bun run dev:desktop`.
- Build desktop assets with `bun --cwd packages/desktop build`.
- Package macOS with `bun --cwd packages/desktop package:mac`.
- GitHub Actions workflow `.github/workflows/desktop-package.yml` builds unsigned macOS arm64 and x64 artifacts on manual dispatch and uploads release assets on `v*` tags.
- macOS signing and notarization are disabled by default. Set `MIMOCODE_MAC_SIGN=true` only when certificates and notarization credentials are configured.
- Auto-update is disabled by default. Set `MIMOCODE_ENABLE_UPDATER=true` only after GitHub release publishing and signing are ready.

## Compatibility Boundaries

- `MIMOCODE_CHANNEL` is the preferred channel variable; `OPENCODE_CHANNEL` remains a fallback.
- `MIMOCODE_PORT` is the preferred sidecar port override; `OPENCODE_PORT` remains a fallback.
- `OPENCODE_*` sidecar env vars, `packages/opencode`, `opencode` database directory, and the sidecar auth username remain internal compatibility points.
- New deep links use `mimocode://`; legacy `opencode://` links are accepted by the shared app parser.

## Verification

- `git remote -v` should show `origin` as `git@github.com:mimo-code-desktop/mimo-code-desktop.git` and `upstream` as `https://github.com/XiaomiMiMo/MiMo-Code.git`.
- `bun --cwd packages/desktop typecheck` should pass.
- `bun --cwd packages/desktop build` should pass.
- `bun --cwd packages/desktop package:mac` should produce macOS DMG/ZIP artifacts in `packages/desktop/dist`.
- Smoke the packaged app by launching it, opening a project folder, starting a session, using native menu commands, and confirming MiMo-branded app name, protocol, artifact name, and user data path.
