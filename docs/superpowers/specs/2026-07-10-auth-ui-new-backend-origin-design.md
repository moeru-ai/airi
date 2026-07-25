# Auth UI New Backend Origin Design

## Problem

The production Auth UI receives `api_server_url=https://airi-server-next.up.railway.app` from the new Go backend, but its standalone bootstrap allowlist does not recognize that origin. The Auth UI therefore falls back to `https://api.airi.build`. Browser requests then fail at the cross-origin boundary and the sign-in page reports `Load failed`.

The new Go backend itself is healthy: its email lookup endpoint returns successfully and explicitly allows the production Auth UI origin.

## Scope

This change is limited to `apps/ui-server-auth`:

- Trust the exact production origin `https://airi-server-next.up.railway.app`.
- Preserve the existing trust entries for the original production backend, server-dev, and localhost development.
- Preserve rejection of arbitrary external origins.

The change must not add wildcard Railway trust, alter iOS login behavior, or change backend CORS policy.

## Implementation

Add the new Go backend origin to `TRUSTED_STANDALONE_API_SERVER_ORIGINS` in `server-auth-context.ts`.

Add a focused regression test that passes a standalone Auth UI URL containing the new backend in `api_server_url` and expects the normalized new backend origin. Existing untrusted-origin coverage remains the security regression guard.

## Verification

Before implementation, the new regression test must fail because the new origin is not trusted. After the minimal allowlist change:

- Run the focused bootstrap-context tests.
- Run the complete Auth UI test suite.
- Run Auth UI type checking and production build.
- Confirm the production bundle contains the new trusted origin after deployment.
- Confirm the live OIDC redirect carries the new backend and the Auth UI selects it.
- Confirm the browser CORS preflight and email lookup succeed against the new backend.

## Delivery

Develop on an isolated branch based on the latest `upstream/main`. Push the branch, open a pull request, and merge only after checks pass. The existing `Cloudflare Pages (Auth UI)` workflow deploys production on pushes to `main`. After deployment, validate the live login boundary before considering the issue resolved.
