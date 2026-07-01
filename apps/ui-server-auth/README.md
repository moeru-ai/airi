# AIRI Server Auth UI

Auth UI for the hosted AIRI server. It is a Vue/Vite app deployed separately from `apps/server` and used for Better Auth sign-in, email verification, password reset, profile, and Electron OIDC callback relay flows.

## Use When

- Building user-facing auth pages backed by server `/api/auth/*` endpoints.
- Updating login, sign-up, verification, reset-password, account profile, or Electron auth relay UX.
- Deploying the auth surface to Cloudflare Workers Static Assets.

## Do Not Use When

- Building the main stage app sign-in callback pages that consume OIDC tokens.
- Adding admin-only operational pages. Those belong in the standalone `proj-airi` admin repository.

## Commands

```sh
pnpm -F @proj-airi/ui-server-auth dev
pnpm -F @proj-airi/ui-server-auth typecheck
pnpm -F @proj-airi/ui-server-auth build
```

## Deployment

`pnpm -F @proj-airi/ui-server-auth build` writes to `apps/ui-server-auth/dist`. Vue Router owns `/ui/*`, while Vite assets are served from root `/assets/*` so Cloudflare Pages can serve static files without rewriting nested asset paths. Cloudflare Pages uses `public/_redirects` to route `/ui/*` back to the SPA HTML.

The production GitHub Actions workflow deploys this app to the Cloudflare Pages project `moeru-ai-airi-auth` with separate auth-account credentials:

```sh
AUTH_CLOUDFLARE_ACCOUNT_ID=...
AUTH_CLOUDFLARE_API_TOKEN=...
```

`apps/ui-server-auth/wrangler.toml` remains available for Workers Static Assets deployments, but production CI uses Cloudflare Pages direct upload.

Production expects:

```sh
VITE_SERVER_URL=https://api.airi.build
```

The server redirects historical `/auth/*` URLs to `AUTH_UI_URL`, which defaults to `https://accounts.airi.build/ui`.

The `server-dev` workflow deploys a Cloudflare Pages branch build at `https://server-dev.moeru-ai-airi-auth.pages.dev/ui/` with `VITE_SERVER_URL=https://airi-server-dev.up.railway.app`. Set the server-dev API environment variable `AUTH_UI_URL=https://server-dev.moeru-ai-airi-auth.pages.dev/ui` when the full dev auth redirect chain should stay on server-dev.
