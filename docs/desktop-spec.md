# MiMo Code Desktop V1 Spec

## Summary

MiMo Code Desktop V1 is an installable macOS-first desktop client for MiMo-Code. It reuses the existing MiMo-Code app and local sidecar server, then wraps them in a compact Electron shell with native menus, project opening, session navigation, deep links, and packaging metadata under the MiMo Code Desktop brand.

## Goals

- Let users install a desktop app and start coding against a local project without running a web server manually.
- Keep the UI calm and developer-tool focused: minimal chrome, native titlebar behavior, dark/light theme support, and compact desktop proportions.
- Preserve the existing MiMo-Code coding workflow, including project picker, sessions, terminal/file-tree commands, notifications, and local sidecar auth.
- Ship macOS DMG/ZIP packaging first; Windows and Linux remain configured but are not V1 release targets.

## User Flows

- Launch app: MiMo Code Desktop starts, initializes the local sidecar on `127.0.0.1`, and opens the main coding interface.
- Open project: user chooses a local folder through the native picker or `mimocode://open-project?directory=...`.
- Start session: user starts a new coding session from the app UI, native File menu, or `mimocode://new-session?directory=...&prompt=...`.
- Navigate: native menu commands trigger existing app commands for sidebar, terminal, file tree, sessions, and projects.
- Update check: update actions are hidden behind the existing app API but disabled by default until release credentials exist.

## Compatibility Notes

- The bundled sidecar still comes from `packages/opencode`, so some internal module names, database paths, auth username, and environment variables intentionally keep `opencode`/`OPENCODE_*`.
- The public desktop identity is MiMo Code: app name, app ID, artifact names, deep link protocol, menu labels, window title, and package metadata.
- Legacy `opencode://` deep links are still accepted as a compatibility fallback, but new links should use `mimocode://`.
