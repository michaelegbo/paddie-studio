# Standalone Studio Execution TODO Tracker

This file tracks implementation status against the full execution spec.

## 1) Repo Structure and Tooling

- [x] pnpm monorepo with required apps/packages layout
- [x] Node 20 enforced everywhere (tooling + Docker)
- [x] TypeScript across workspaces
- [x] MongoDB-backed Studio persistence
- [x] Redis namespaced cache/queue usage under `studio:`

## 2) Website and Branding

- [x] Route set: `/`, `/features`, `/pricing`, `/docs`, `/download`, `/login`, `/signup`, `/auth/callback`
- [x] Paddie visual language + logo usage
- [x] CTA behavior: auth-aware `Launch Studio`
- [x] Studio screenshots/GIF assets integrated in site sections

## 3) Standalone Studio App Extraction

- [x] Full builder UI extracted into standalone web app
- [x] Node set implemented in v1: webhook/chat/http/websocket/if-else/loop/output/ai/orchestrator/memory
- [x] History + execution output + chat + mapping + node modal parity in standalone app
- [x] Further modularization from single large Studio page into shared modules (`components/studio` + `lib/fieldMapping`)

## 4) Studio Backend

- [x] Flow CRUD
- [x] Run execution + traces
- [x] Flow history/snapshots
- [x] Webhook/chat execution
- [x] Node testing
- [x] Provider/model discovery
- [x] Studio session management
- [x] Persist generated code artifacts into `studio_artifacts` collection

## 5) Connector Architecture

- [x] `AuthProvider`, `AIProvider`, `MemoryProvider` contracts
- [x] `PaddieAuthConnector`, `PaddieAIConnector`, `PaddieMemoryConnector`
- [x] Paddie-specific behavior isolated in connector package

## 6) Paddie Auth (OIDC)

- [x] OIDC provider present in RMN backend with first-party clients
- [x] Studio web login wired through authorization code + PKCE callback path
- [x] Desktop deep-link callback path implemented

## 7) Paddie Connector APIs

- [x] `studio-connect` AI + memory endpoints in RMN
- [x] Studio backend uses authenticated user context for session-mode memory

## 8) Electron

- [x] Thin shell over Studio frontend
- [x] `nodeIntegration: false`, `contextIsolation: true`, sandbox enabled
- [x] Deep-link callback `studio://auth/callback`
- [x] Keychain-backed session storage
- [x] Strict CSP hardening for desktop renderer responses
- [x] Ensure logout clears keychain and forces login state
- [x] Dist scripts for Windows/macOS/Linux
- [x] GitHub Releases workflow for installers

## 9) Deployment on RMN VM / Cloudflare

- [x] Separate compose stack and edge router config for `studio.paddie.io`
- [x] Verify and automate final deployment checks (TLS, route reachability, webhook reachability)

## 10) Verification

- [x] Workspace build passes (`pnpm build`)
- [x] Add smoke test script for key API routes and auth flow checks
