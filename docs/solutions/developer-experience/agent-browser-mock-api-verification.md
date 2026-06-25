---
title: Agent Browser Verification With Mock APIs
date: 2026-06-06
category: developer-experience
module: Local frontend verification
problem_type: developer_experience
component: tooling
severity: medium
applies_when:
  - "Verifying a local Vite or Vue page that is gated by backend authentication"
  - "Using agent-browser, Playwright MCP, or browser screenshots to inspect local UI changes"
  - "The real backend is unavailable, unauthenticated, or too expensive to call during UI verification"
  - "pnpm fails before running the requested command because a proto shim tries to update files outside the workspace sandbox"
tags:
  - agent-browser
  - playwright
  - mock-api
  - vite
  - pnpm
  - proto
---

# Agent Browser Verification With Mock APIs

## Context

Local UI verification can waste time when the page depends on backend state that the browser cannot reach. In the Voice Pack admin page work, opening the page through the browser first showed only `Admin access required` because the root app requests `/api/admin/me` before rendering child routes. The form itself was fine, but the real page could not be inspected until the auth boundary was handled.

The same session also hit two tool-environment traps:

- launching a standalone Playwright browser failed because the Playwright-managed browser cache was missing;
- running `pnpm` through the proto shim failed with `fs::perms` because the shim attempted to update `~/.proto/.../pnpx`, which was outside the active workspace sandbox.

## Guidance

Start with the in-app Browser or Playwright MCP against the real local URL, but treat an auth-only page as an environment boundary, not as proof the feature page is broken. Capture a snapshot first because it identifies the blocking text and accessible controls faster than screenshots.

When the root app blocks on auth or backend bootstrap, provide a tiny local mock API and point the Vite app at it. For AIRI admin pages, the useful pattern is:

```bash
node -e "const http=require('http'); /* serve /api/admin/me and required page APIs */"
```

Then run the app with the mock server as the API origin:

```bash
VITE_SERVER_URL=http://127.0.0.1:8787 ./node_modules/.bin/vite --host 127.0.0.1 --port 5175
```

Prefer the repository binary or the actual pnpm CJS entrypoint when the global `pnpm` command fails before the project script starts:

```bash
node /Users/luoling8192/.proto/tools/pnpm/10.33.0/bin/pnpm.cjs -F @proj-airi/ui-admin exec vue-tsc --noEmit
```

This avoids the proto shim permission update and keeps validation focused on project failures. If a new Codex thread has `/Users/luoling8192/.proto` in its writable roots, normal `pnpm` may be fine again; verify with:

```bash
test -w /Users/luoling8192/.proto
```

Use the browser tools in this order:

1. Open the real route and take an accessibility snapshot.
2. If auth blocks the route, inspect the app root to find the bootstrap request.
3. Start a mock API with only the endpoints required for that route.
4. Restart or start Vite with the mock API origin.
5. Re-open the route and validate the actual controls through accessibility snapshots.
6. Use screenshots only after the DOM is known to be the intended page; screenshots can stall on font loading.

Do not over-claim browser behavior from a fake backend. Mock verification can prove layout, accessible controls, routing, and button wiring are present. It cannot prove real provider behavior, real audio generation, auth cookies, billing, or production routing unless those real services were used.

## Why This Matters

Without this sequence, browser verification turns into tool thrash: trying new tabs, launching standalone Playwright, retrying screenshots, and rerunning pnpm with escalation while the real problem is simply that the app has not rendered the target page yet.

Separating boundaries keeps the evidence clean:

- auth failures explain why the target page is absent;
- mock API runs verify UI rendering and interaction shape;
- real backend runs verify integration behavior;
- pnpm/proto shim failures are environment setup noise unless the project command actually starts and fails.

## When to Apply

- A local page redirects to sign-in or renders an access-required shell before the component under test appears.
- The frontend already supports an API-origin environment variable such as `VITE_SERVER_URL`.
- The feature needs visual or accessibility verification but does not require live provider side effects.
- Browser screenshots time out or standalone Playwright fails before navigation.
- `pnpm` reports `fs::perms` around `~/.proto` before printing project script output.

## Examples

Before:

```text
Open /admin/voice-packs/new
See "Admin access required"
Try screenshots and standalone Playwright
Treat missing form as ambiguous UI failure
```

After:

```text
Open /admin/voice-packs/new
Snapshot shows /api/admin/me blocks rendering
Mock /api/admin/me, /api/admin/voice-packs, /api/v1/audio/models, and /api/v1/audio/voices
Run Vite with VITE_SERVER_URL pointing to the mock API
Snapshot confirms the form, combobox fields, catalog counts, and buttons render
Reserve real audio claims for a real /api/v1/audio/speech backend run
```

For audio or media tests, a mock response can confirm the request path is wired, but it may not prove browser playback. Confirm `<audio controls>` appears only when the DOM shows it, and confirm provider behavior only with the real backend and a valid media response.

## Related

- `docs/ai/context/verification-automation.md`
- `docs/ai/context/ui-components.md`
