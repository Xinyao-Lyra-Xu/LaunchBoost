# LaunchBoost

LaunchBoost is a motivation-powered spinner app designed to overcome startup resistance. It helps you break inertia by randomly selecting a small, actionable first step so you can move from hesitation to momentum faster.

## Tech stack

- **Electron** desktop shell (`main.js` main process, `preload.js` IPC bridge)
- **React + TypeScript** application under `src/`, organized in Clean Architecture layers
  (`domain` → `application` → `interface-adapters` → `frameworks`)
- **Vite** for bundling, **Vitest** for tests

> **Migration note:** the app is mid-migration. The shipping UI is still the legacy
> `index.html` + `renderer.js` monolith; the `src/` React rewrite is fully tested but
> not yet wired into `index.html`. Completing that switch is the next planned phase.

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

## Configuration

Task-splitting uses the Anthropic API. Provide a key via either:

- a local `config.json` (git-ignored) — copy `config.json.example` and fill it in, or
- the `ANTHROPIC_API_KEY` environment variable.
