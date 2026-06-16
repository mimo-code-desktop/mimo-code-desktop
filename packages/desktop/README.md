# MiMo Code Desktop

The MiMo Code Desktop app, built with Electron on top of the MiMo-Code monorepo.

## Development

```bash
bun install
bun run dev:desktop
```

## Build

Run the `build` script to build the app's JS assets, then `package` to
bundle the assets as an application. The resulting app will be in `dist/`.

```bash
bun --cwd packages/desktop build
bun --cwd packages/desktop package:mac
```
