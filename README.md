# Paddie Studio

Standalone Studio product for Paddie with:

- Public site: `studio.paddie.io/` (`apps/site`)
- Builder app: `studio.paddie.io/app` (`apps/web`)
- Backend API: `studio.paddie.io/api/*` (`apps/server`)
- Electron desktop shell (`apps/desktop`)

## Monorepo Layout

- `apps/site` - Next.js marketing and auth entry routes
- `apps/web` - Vite + React Studio builder UI
- `apps/server` - Express + TypeScript Studio backend
- `apps/desktop` - Electron desktop app
- `packages/types` - Shared Studio contracts
- `packages/ui` - Shared Paddie UI primitives
- `packages/runtime` - Runtime package surface
- `packages/connectors-core` - Generic connector interfaces
- `packages/connectors-paddie` - Paddie auth/memory/AI connectors

## Key Backend Capabilities

The standalone Studio backend now owns:

- flow CRUD (`studio_flows`)
- run execution + traces (`studio_flow_runs`)
- flow snapshots/history (`studio_flow_history`)
- session management (`studio_sessions`)
- webhook/manual/chat execution
- per-node testing
- code generation (JavaScript + Python + StackBlitz payload)
- model discovery for OpenAI/Azure OpenAI/Groq

## Environment

Copy `.env.example` and set values:

- `MONGODB_URI`, `MONGODB_DATABASE=studio_prod`
- `REDIS_URL`, `REDIS_PREFIX=studio:`
- `PADDIE_API_BASE_URL`
- OIDC settings:
  - `PADDIE_OIDC_ISSUER`
  - `STUDIO_OIDC_CLIENT_ID_WEB`
  - `STUDIO_OIDC_CLIENT_ID_DESKTOP`
  - `STUDIO_OIDC_REDIRECT_URI_WEB`
  - `STUDIO_OIDC_REDIRECT_URI_DESKTOP`
- Azure system model vars for Paddie GPT-4.1 path

## Development

```bash
pnpm install
pnpm build

# run services independently
pnpm dev:server
pnpm dev:web
pnpm dev:site
pnpm dev:desktop
```

## Docker

`docker-compose.yml` runs:

- `studio-site`
- `studio-web`
- `studio-server`
- `studio-edge` (nginx path router for `/`, `/app`, `/api`)

## Deployment Verification

Run smoke checks for the hosted stack:

```bash
pnpm verify:deploy
```

Optional env overrides:

- `STUDIO_BASE_URL` (default `https://studio.paddie.io`)
- `PADDIE_OIDC_ISSUER` (default `https://api.paddie.io`)
- `STUDIO_SMOKE_TIMEOUT_MS` (default `15000`)

## Desktop Distribution

Desktop build scripts:

```bash
pnpm --filter @paddie-studio/desktop dist:win
pnpm --filter @paddie-studio/desktop dist:mac
pnpm --filter @paddie-studio/desktop dist:linux
```

The desktop app supports `studio://auth/callback` deep-link login and keychain-backed session persistence.
