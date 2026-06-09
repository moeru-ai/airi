# AIRI Admin Dashboard

Admin dashboard for operating the hosted AIRI server. It is a standalone Vue/Vite app deployed to Cloudflare Pages under `/admin`; the API server redirects its historical `/admin/*` entrypoints to this app.

## Use When

- Reviewing server metrics, users, flux balances, LLM router config, and curated Voice Packs.
- Building operator-only workflows that depend on the server admin API under `/api/admin`.

## Do Not Use When

- Building end-user settings or character-card flows. Those belong in the stage apps and shared stage packages.
- Adding unauthenticated server UI. This app expects the server admin guard and Better Auth session cookies.

## Commands

```sh
pnpm -F @proj-airi/ui-admin dev
pnpm -F @proj-airi/ui-admin typecheck
pnpm -F @proj-airi/ui-admin build
```

## Build Output

`pnpm -F @proj-airi/ui-admin build` writes to `apps/ui-admin/dist`. Server builds do not package this output; deploy the directory through the admin Cloudflare Pages workflow.
