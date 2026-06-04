# LaunchBoost

LaunchBoost is a motivation-powered spinner app designed to overcome startup resistance. It helps you break inertia by randomly selecting a small, actionable first step so you can move from hesitation to momentum faster.

## Tech stack

- **Electron** desktop shell (`main.js` main process, `preload.js` IPC bridge)
- **React + TypeScript** application under `src/`, organized in Clean Architecture layers
  (`domain` → `application` → `interface-adapters` → `frameworks`)
- **Vite** for bundling, **Vitest** for tests
- **electron-builder** for Windows installers

`index.html` is a minimal React mount point that loads the Vite bundle
(`dist/renderer.bundle.js`); the Electron main process loads it via `win.loadFile`.

## Development

```bash
npm install        # install dependencies
npm run dev        # build the renderer bundle and launch Electron
npm start          # launch Electron without rebuilding
```

## Quality gates

All of these run in CI on every push / PR (`.github/workflows/ci.yml`):

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run format:check  # prettier --check
npm run test          # vitest run
npm run build         # vite production build

npm run check         # typecheck + lint + test in one shot
```

Auto-fixers:

```bash
npm run lint:fix      # eslint --fix
npm run format        # prettier --write
```

## Packaging (Windows)

Installers are built with electron-builder (config lives in the `build` field of
`package.json`). Targets: an NSIS installer and a portable `.exe`.

```bash
npm run pack:dir   # build an unpacked app under release/ (fast smoke test)
npm run dist       # build the NSIS installer + portable exe under release/
```

Releasing is automated: pushing a `v*` tag runs `.github/workflows/release.yml`
on a Windows runner, which builds the installers and uploads them to the matching
GitHub Release.

```bash
# bump "version" in package.json first, then:
git tag v1.1.0
git push origin v1.1.0
```

> **App icon:** none is set yet, so builds use the default Electron icon. To add
> one, drop a 256×256+ `icon.ico` into `assets/` (the configured buildResources dir).

## Configuration

Task-splitting uses the Anthropic API. The key is read in this order:

1. the `ANTHROPIC_API_KEY` environment variable, else
2. the encrypted key store, else
3. a legacy plaintext `config.json` (auto-migrated into the encrypted store on
   next launch).

Set the key in-app via the **⚙️ settings** button (top-right). It is encrypted at
rest with the OS keystore (Windows DPAPI) through Electron `safeStorage` — never
written to disk in plaintext. Without a key, splitting falls back to local
templates.

## Diagnostics

Uncaught errors from both the main and renderer processes are appended to a
rotating log file at `<userData>/logs/launchboost.log` (one previous log is kept
as `.log.1`). On Windows `<userData>` is `%APPDATA%/LaunchBoost`.
