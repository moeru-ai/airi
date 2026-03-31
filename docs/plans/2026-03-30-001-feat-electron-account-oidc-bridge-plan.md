---
title: "feat: Electron account page & OIDC session bridge"
type: feat
status: completed
date: 2026-03-30
origin: docs/superpowers/specs/2026-03-30-electron-account-flux-design.md
deepened: 2026-03-30
---

# feat: Electron account page & OIDC session bridge

## Overview

Fix the broken Electron post-login state (OIDC tokens != better-auth sessions), add a shared account settings page, and improve the controls island UX by routing to the account page instead of immediately logging out.

## Problem Frame

After OIDC login in Electron, `fetchSession()` fails silently because better-auth's `bearer()` plugin expects session tokens from the `session` table, but the Electron client stores OIDC access tokens from the `oauth_access_token` table. This means `isAuthenticated` stays false, the avatar never shows, and all authenticated API calls fail. Additionally, there is no account/profile page anywhere in the app, and the controls island button triggers logout on click with no confirmation.

## Requirements Trace

- R1. After OIDC login in Electron, the user must end up with a valid better-auth session token so `fetchSession()` succeeds and `isAuthenticated` becomes true
- R2. A shared account settings page displays user profile (avatar, name, email), Flux balance summary, and logout
- R3. Unauthenticated users see a login prompt on the account page that works in both Web and Electron
- R4. Authenticated click on the controls island auth button navigates to `/settings/account` instead of logging out
- R5. Logout moves to the account page with proper cleanup (server signOut + Electron IPC)
- R6. i18n keys added for account page UI text

## Scope Boundaries

- No profile editing (name, avatar changes)
- No account deletion
- No `settingsEntry` on flux.vue (accessed as sub-page from account)
- No changes to Web HeaderAvatar.vue (already works)
- Electron session renewal (auto-refresh after bridge) is a documented follow-up, not in scope
- Token persistence security (safeStorage in main process) is a documented follow-up
- The bridge endpoint validates only the OIDC access token. Refresh token storage, renewal scheduling, and session auto-refresh are all deferred follow-ups

## Context & Research

### Relevant Code and Patterns

- **Server route registration**: `apps/server/src/app.ts` L167-174 — `/api/auth/*` catch-all forwards to better-auth. A custom OIDC endpoint must be registered *before* this catch-all
- **Route factory pattern**: `apps/server/src/routes/flux/index.ts` — factory function returns `Hono<HonoEnv>` instance
- **Error handling**: `apps/server/src/utils/error.ts` — `ApiError` with `createUnauthorizedError()`, `createBadRequestError()`, etc.
- **OAuth access token schema**: `apps/server/src/schemas/accounts.ts` L103-123 — `oauthAccessToken` table with `accessToken`, `userId`, `accessTokenExpiresAt`
- **Session middleware**: `apps/server/src/middlewares/auth.ts` — `sessionMiddleware` (non-blocking) + `authGuard` (blocking). Bridge endpoint needs neither (custom OIDC token validation)
- **Auth client library**: `packages/stage-ui/src/libs/auth.ts` — `persistTokens()`, `fetchSession()`, `signOut()`, `getAuthToken()`. New helper follows the same pure-function pattern
- **Auth store**: `packages/stage-ui/src/stores/auth.ts` — `token`, `refreshToken`, `user`, `session` via `useLocalStorage`
- **Settings page pattern**: `packages/stage-pages/src/pages/settings/connection/index.vue` — `<route lang="yaml">` with `settingsEntry: true`, `layout: settings`, `titleKey`, `icon`, `order`
- **Controls island auth button**: `apps/stage-tamagotchi/src/renderer/components/stage-islands/controls-island/controls-island-auth-button.vue` — IPC via eventa, listens to `electronAuthCallback`
- **Settings window navigation**: `apps/stage-tamagotchi/src/main/windows/settings/index.ts` L84-96 — `openWindow(route)` emits `electronSettingsNavigate` if window exists, so navigating from controls island to `/settings/account` works correctly
- **Settings window IPC**: `apps/stage-tamagotchi/src/main/windows/settings/rpc/index.electron.ts` — does NOT register auth service. However, eventa uses `ipcMain` globally (not window-namespaced per the TODO at L29), so `electronAuthStartLogin` invoked from settings window will reach the auth handler registered by the main window's context
- **i18n**: `packages/i18n/src/locales/en/settings.yaml` — YAML format, keys under `pages.<name>.title`/`.description`

### Institutional Learnings

- better-auth `redirect_uri` uses exact `===` matching — fixed port range 19721-19725 (see origin: `docs/superpowers/plans/2026-03-29-oidc-auth-improvements.md`)
- `authClient` is initialized at module scope before Pinia; `getAuthToken()` reads `localStorage` directly — key `auth/v1/token` must stay consistent
- `credentials: "omit"` override is critical — Bearer-only auth, no cookies
- `useLocalStorage` from VueUse listens to `storage` events across windows/tabs — when one window writes `authStore.token`, other windows' reactive refs update automatically

## Key Technical Decisions

- **Bridge endpoint placement**: Register as a Hono `.route()` *after* the rate limiter `.use('/api/auth/*', rateLimiter(...))` at L167 but *before* the catch-all `.on(['POST', 'GET'], '/api/auth/*', ...)` handler at L172. Rationale: the rate limiter is middleware that must apply; the catch-all forwards to better-auth and would swallow the request. Inserting between L171 and L172 ensures both rate limiting and correct routing. The endpoint needs custom OIDC token validation (not session-based), so it cannot use `sessionMiddleware` + `authGuard`.

- **Bridge scoped to Electron client only**: The token query includes `WHERE clientId = OIDC_CLIENT_ID_ELECTRON` in addition to the access token match. Rationale: the bridge is a token-escalation primitive (converts scoped OIDC token → full session). Without client restriction, tokens issued to any trusted client (Web, Mobile) could mint sessions via this endpoint, collapsing client-isolation boundaries.

- **Bridge validates token expiry**: The endpoint checks `accessTokenExpiresAt > now` and rejects expired tokens with 401. Rationale: accepting expired tokens widens the attack window for exfiltrated tokens. The time window between OIDC callback and bridge call is typically < 1 second, so expiry is unlikely but must be guarded.

- **Idempotent bridge with delayed token deletion**: The bridge is idempotent — repeated calls with the same OIDC token return the same session token. On first call: create a session and store a mapping (`oidc_token → session_token`) with a short TTL (e.g., 5 minutes). On repeated calls within the TTL: return the cached session token without creating a new session. After TTL expiry: delete the `oauth_access_token` row. Rationale: if the HTTP response is lost (network timeout, renderer crash), the client can retry without a full re-login through the browser. The TTL bounds the replay window while preserving retryability. Defense-in-depth against token interception is maintained by client ID restriction + token expiry + TTL-bounded replay.

- **Uniform 401 error responses**: All bridge failure cases (token missing, not found, expired, wrong client) return the same generic 401 message (e.g., "Invalid or expired token"). Rationale: prevents information leakage — an attacker cannot distinguish between "token doesn't exist" and "token expired" to refine their approach.

- **Session creation via `internalAdapter`**: Use better-auth's internal adapter accessed via `(await auth.$context).internalAdapter.createSession(userId)` to create sessions rather than raw DB inserts. Rationale: ensures session table records are correctly formed with proper expiry, triggers `databaseHooks.session.create.after` (which increments `activeSessions`), and avoids coupling to internal schema details. Reference: better-auth's admin plugin uses this path at `admin/routes.mjs`, and test-utils at `auth-helpers.mjs`. Note: `createAuth()` returns `any` due to TS2742, so the implementer must access `$context` without type safety.

- **OIDC token never written to `authStore.token`**: The renderer callback handler passes the OIDC access token directly to `exchangeOIDCTokenForSession()` as a function argument. Only the session token returned by the bridge is written to `authStore.token`. Rationale: eliminates a race condition — if the OIDC token is written to `auth/v1/token` first, any concurrent `fetchSession()` (triggered by VueUse reactivity, other windows, or auto-fetch) would send the OIDC token to better-auth's `getSession()`, which fails and clears all auth state, potentially racing with the bridge response.

- **Auth callback listener at service level, not component level**: The `electronAuthCallback` and `electronAuthCallbackError` listeners are registered in a renderer-level service or Pinia plugin (not in the `controls-island-auth-button` Vue component's `onMounted`). The component reactively displays auth state but does not own the callback lifecycle. Rationale: if the component is ever unmounted (route navigation, error boundary, Vue keep-alive eviction), component-scoped listeners would be cleaned up, silently dropping OIDC tokens from a completed browser flow. A service-level listener persists for the window's lifetime.

- **Electron account page login uses direct IPC**: The account page detects `isStageTamagotchi()` and directly invokes `electronAuthStartLogin` via eventa, rather than relying on `needsLogin` store mechanism. Rationale: `needsLogin` doesn't cross Electron window boundaries (each renderer has its own Pinia instance). Since eventa IPC handlers are currently global (not window-namespaced), the settings window can invoke handlers registered by the main window's context. The auth callback events (`electronAuthCallback`) only emit to the main window, but the main window's service-level handler writes to localStorage, and `useLocalStorage` in the settings window picks up the change reactively.

- **Bridge endpoint requires HTTPS in production**: The client helper should validate that `SERVER_URL` uses HTTPS in production builds. The OIDC access token travels as a Bearer header — plain HTTP would expose it in transit. Development/localhost is exempt.

- **Logout clears local state regardless of server error**: If `signOut()` throws (server unreachable), local state is still cleared. Rationale: user intent to log out should be respected; server session expires naturally.

## Open Questions

### Resolved During Planning

- **Q: Can the settings window invoke `electronAuthStartLogin`?** Yes. eventa IPC handlers use `ipcMain` globally (confirmed by the TODO comment at settings RPC L29 about future window-namespaced contexts). The auth handler registered by the main window's context is accessible from any renderer.

- **Q: How does the settings window receive the auth callback?** It doesn't directly — `electronAuthCallback` emits to the main window's context. But the main window's handler writes `authStore.token` to localStorage, and the settings window's `useLocalStorage` reactive ref picks up the change via the `storage` event. The account page reactively transitions to authenticated state.

- **Q: Does `openWindow(route)` navigate if settings window is already open?** Yes. `SettingsWindowManager.openWindow()` emits `electronSettingsNavigate` with the route when the window and context exist (L91-93 of `settings/index.ts`).

- **Q: What rate limiting applies to the bridge endpoint?** The existing `/api/auth/*` rate limiter (L167-170 of `app.ts`) covers it, provided the route is mounted *after* the `.use()` middleware. Note: the rate limiter's `keyGenerator` currently reads `x-forwarded-for` / `x-real-ip` headers, which are spoofable by direct clients. This is a pre-existing issue affecting all `/api/auth/*` routes. If addressed, it should be a separate fix (change to `getConnInfo()` or trust proxy-set headers only).

### Deferred to Implementation

- **Session creation API verification**: The path `(await auth.$context).internalAdapter.createSession(userId)` has been identified from better-auth source (used by admin plugin and test helpers). Verify at implementation time that: (a) the returned `session.token` value round-trips correctly through `auth.api.getSession({ headers })`, and (b) the `databaseHooks.session.create.after` hook fires (check `activeSessions` metric). Fallback if `internalAdapter` is unavailable or breaks: raw Drizzle insert into `session` table using `generateId()` from better-auth + manual hook invocation.
- **Scope validation on OIDC tokens**: The `oauth_access_token` table has a `scopes` column. Consider validating that the token includes at least `openid` scope. Low priority for first-party-only usage but good defense-in-depth.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Electron Login Flow (after bridge):

  Main Process                    Renderer (Main Window)           Renderer (Settings Window)
  ─────────────                   ──────────────────────           ─────────────────────────
  OIDC code exchange
  → emit electronAuthCallback
       ─────────────────────────→ receive tokens
                                  POST /api/auth/oidc/session
                                    (Bearer: oidc_access_token)
                                  receive session_token
                                  authStore.token = session_token
                                    → localStorage write ──────────→ useLocalStorage picks up
                                  fetchSession() → success           isAuthenticated = true
                                  isAuthenticated = true              (reactive update)

  Server (POST /api/auth/oidc/session):

  Bearer token
    → query oauth_access_token WHERE accessToken = ? AND clientId = ELECTRON_CLIENT_ID
    → check accessTokenExpiresAt > now
    → extract userId
    → auth.api create session for userId
    → delete oauth_access_token row (single-use enforcement)
    → return { token: session_token }
```

## Implementation Units

- [ ] **Unit 1: Server bridge endpoint `POST /api/auth/oidc/session`**

**Goal:** Create a server endpoint that validates an OIDC access token and returns a better-auth session token.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `apps/server/src/routes/oidc/session.ts`
- Modify: `apps/server/src/app.ts` (register route before catch-all)
- Test: `apps/server/src/routes/oidc/session.test.ts`

**Approach:**
- Create a route factory `createOIDCSessionRoute(auth, db, electronClientId)` returning a Hono app with a single `POST /` handler. Pass `deps.env.OIDC_CLIENT_ID_ELECTRON` as `electronClientId` from `buildApp()`
- Extract Bearer token from `Authorization` header
- Query `oauthAccessToken` table: `WHERE accessToken = ? AND clientId = electronClientId` using drizzle `eq()` + `and()`
- Validate: token exists, `accessTokenExpiresAt` > now, `userId` is non-null
- Create a better-auth session via `(await auth.$context).internalAdapter.createSession(userId)` — returns a session object with `.token`
- Wrap the token lookup and session creation in a database transaction (or `SELECT ... FOR UPDATE` on the `oauth_access_token` row) to prevent concurrent session creation from the same token
- On first call: create session, cache the `oidc_token → session_token` mapping (in-memory or short-lived DB record, TTL ~5 min). On repeated calls within TTL: return the cached session token
- After TTL expires: delete the `oauth_access_token` row (can be done lazily on next lookup or via a cleanup sweep)
- Return `{ token: sessionToken }` on success
- Return uniform 401 via `createUnauthorizedError('Invalid or expired token')` for all failure cases (no information leakage)
- In `app.ts`, mount after the `.use('/api/auth/*', rateLimiter(...))` middleware and before the `.on(['POST', 'GET'], '/api/auth/*', ...)` catch-all handler. **Important**: Hono's `.route()` creates a sub-app that may not inherit parent middleware. Prefer registering as a `.post('/api/auth/oidc/session', handler)` directly on the parent app to guarantee the rate limiter applies, or add the rate limiter inside the sub-app. Verify empirically that the chosen approach receives rate limiting

**Patterns to follow:**
- `apps/server/src/routes/flux/index.ts` (route factory pattern)
- `apps/server/src/utils/error.ts` (ApiError pattern)
- `apps/server/src/schemas/accounts.ts` (oauthAccessToken schema)

**Test scenarios:**
- Happy path: valid, non-expired Electron-client OIDC token → returns 200 with `{ token }` and the token resolves via `auth.api.getSession()`
- Happy path: repeated call with same OIDC token within TTL → returns same session token (idempotent)
- Happy path: call with same OIDC token after TTL expires → 401 (token deleted)
- Error path: missing Authorization header → 401 with generic message
- Error path: token not found in `oauth_access_token` table → 401 with same generic message
- Error path: token found but `accessTokenExpiresAt` is in the past → 401
- Error path: token belongs to a different client (e.g., Web client ID) → 401
- Edge case: token exists but `userId` is null → 401

**Verification:**
- Endpoint responds correctly to valid and invalid tokens
- Session token returned by the endpoint is accepted by `auth.api.getSession()`
- Typecheck passes

---

- [ ] **Unit 2: Auth library helper for OIDC-to-session exchange**

**Goal:** Add a client-side helper function that calls the bridge endpoint and persists the session token.

**Requirements:** R1

**Dependencies:** Unit 1

**Files:**
- Modify: `packages/stage-ui/src/libs/auth.ts`

**Approach:**
- Add `exchangeOIDCTokenForSession(oidcAccessToken: string): Promise<void>` function
- `fetch(SERVER_URL + '/api/auth/oidc/session', { method: 'POST', headers: { Authorization: 'Bearer ' + oidcAccessToken } })`
- Parse response JSON for `{ token }`
- Write `authStore.token = token` (replaces OIDC access token with session token)
- Throw on non-200 response with error message from body
- Follow the existing pattern of pure HTTP call + store write (like `persistTokens`)

**Patterns to follow:**
- `packages/stage-ui/src/libs/auth.ts` — `persistTokens()`, `fetchSession()`

**Test scenarios:**
- Happy path: valid response → store.token is set to session token
- Error path: 401 response → throws with error message
- Error path: network failure → throws

**Verification:**
- Function correctly stores session token and clears OIDC access token
- Typecheck passes

---

- [ ] **Unit 3: Move auth callback to service level and use session bridge**

**Goal:** Extract the `electronAuthCallback` listener from the Vue component into a renderer-level service, and modify it to exchange the OIDC token for a session token before calling `fetchSession()`.

**Requirements:** R1

**Dependencies:** Unit 2

**Files:**
- Create: `apps/stage-tamagotchi/src/renderer/services/auth-callback.ts` (new service-level listener)
- Modify: `apps/stage-tamagotchi/src/renderer/components/stage-islands/controls-island/controls-island-auth-button.vue` (remove callback listeners, keep only reactive display + login trigger)
- Modify: `apps/stage-tamagotchi/src/renderer/App.vue` or renderer entry (register the service)

**Approach:**
- Extract `electronAuthCallback` and `electronAuthCallbackError` listeners from `controls-island-auth-button.vue` into a new service module
- Register the service at the renderer entry level (e.g., in `App.vue`'s setup or a Pinia plugin) so it persists for the window's lifetime
- In the callback handler:
  1. Receive `tokens` from main process (OIDC tokens)
  2. **Do NOT write `tokens.accessToken` to `authStore.token`** — pass it directly to the bridge function
  3. Call `exchangeOIDCTokenForSession(tokens.accessToken)` — writes the *session* token to `authStore.token`
  4. Call `fetchSession()` — now succeeds because the stored token is a valid session token
- Add error handling: if bridge call fails, show toast error via `toast.error()` and don't proceed
- The button component becomes purely reactive (display auth state, trigger login/navigate)
- Progressive refactor: replace any `error instanceof Error ? error.message : String(error)` with `errorMessageFrom(error)` from `@moeru/std`

**Patterns to follow:**
- Service pattern in `apps/stage-tamagotchi/src/main/services/` (adapted for renderer)
- `errorMessageFrom` from `@moeru/std` per AGENTS.md conventions

**Test scenarios:**
- Happy path: callback receives tokens → bridge call succeeds → fetchSession succeeds → isAuthenticated becomes true
- Happy path: bridge call retried (idempotent) → same session token returned
- Error path: bridge call fails (401) → toast error shown, isAuthenticated stays false
- Error path: bridge call fails (network) → toast error shown, OIDC token available for retry
- Edge case: callback fires while component is unmounted → service still handles it correctly

**Verification:**
- After OIDC login in Electron, the avatar displays correctly in the controls island
- `fetchSession()` returns true after the bridge exchange
- Listener persists even if controls island component is unmounted

---

- [ ] **Unit 4: Controls island button navigates to account page when authenticated**

**Goal:** Change authenticated click behavior from immediate logout to navigating to `/settings/account`.

**Requirements:** R4

**Dependencies:** Unit 3 (same file), Unit 5 (soft: account page must exist for navigation to work)

**Files:**
- Modify: `apps/stage-tamagotchi/src/renderer/components/stage-islands/controls-island/controls-island-auth-button.vue`

**Approach:**
- Import `electronOpenSettings` from shared eventa
- In `handleClick()`: if authenticated, invoke `electronOpenSettings` with `{ route: '/settings/account' }` instead of calling `logout()`
- Remove the authenticated branch's logout + store-clearing code (lines 37-43 in current code: the `logout()` call and `authStore.user/session/token/refreshToken = null` assignments). Logout now lives on the account page (Unit 5)
- Update tooltip text for authenticated state (change from "logout" to "account" or similar — check i18n keys)
- The `logout` IPC import may no longer be needed in this component after this change

**Patterns to follow:**
- `electronOpenSettings` usage in `controls-island-profile-picker.vue` or `controls-island/index.vue`

**Test scenarios:**
- Happy path: authenticated user clicks button → `electronOpenSettings` invoked with `{ route: '/settings/account' }`
- Happy path: unauthenticated user clicks button → `startLogin()` invoked (unchanged)
- Edge case: `needsLogin` watcher still triggers `startLogin()` when set (unchanged)

**Verification:**
- Clicking the avatar opens the settings window at the account page
- No accidental logout on click

---

- [ ] **Unit 5: Account settings page**

**Goal:** Create the shared account settings page with authenticated/unauthenticated states.

**Requirements:** R2, R3, R5

**Dependencies:** None (uses i18n keys from Unit 6; if not yet complete, use hardcoded strings and replace when keys are available)

**Files:**
- Create: `packages/stage-pages/src/pages/settings/account/index.vue`
- Modify: `packages/stage-ui/src/libs/auth.ts` (make `signOut()` resilient to server errors)

**Approach:**
- Route meta: `layout: settings`, `settingsEntry: true`, `order: 0`, `icon: i-solar:user-circle-bold-duotone`, `titleKey: settings.pages.account.title`
- Use `useAuthStore()` for `isAuthenticated`, `user`
- **Authenticated state:**
  - Circular avatar image (`user.image`), name (`user.name`), email (`user.email`)
  - "Signed in as" label
  - Flux balance summary card with `RouterLink` to `/settings/flux`
  - Logout button (red/destructive style) at bottom
- **Unauthenticated state:**
  - Prompt text explaining login is needed
  - Login button
- **Login logic (Electron-aware):**
  - Import `isStageTamagotchi` from `@proj-airi/stage-shared`
  - If Electron: use `useElectronEventaInvoke(electronAuthStartLogin)` to trigger login directly via IPC
  - If Web: set `authStore.needsLogin = true` (existing mechanism works for web)
  - The auth callback writes to localStorage → settings window's store updates reactively → page transitions to authenticated state
- **Logout logic:**
  - Modify `signOut()` in `auth.ts` to wrap `authClient.signOut()` in try/catch so local state cleanup (timer clear + store clear) runs regardless of server errors. Show a warning toast if the server call fails
  - If Electron: additionally invoke `electronAuthLogout` IPC
  - Navigate to `/settings` after logout
- Use `:class` arrays per AGENTS.md style guide
- Use Iconify icons from `i-solar:*` set

**Patterns to follow:**
- `packages/stage-pages/src/pages/settings/connection/index.vue` (route meta pattern)
- `packages/stage-pages/src/pages/settings/data/index.vue` (complex settings page with sections)
- `controls-island-auth-button.vue` (eventa IPC pattern for Electron)

**Test scenarios:**
- Happy path: authenticated user sees avatar, name, email, flux card, logout button
- Happy path: unauthenticated user sees login prompt and login button
- Happy path: logout button calls `signOut()` and navigates to `/settings`
- Integration: Electron login button invokes `electronAuthStartLogin` IPC
- Integration: Web login button sets `needsLogin = true`
- Edge case: user has no avatar image → falls back gracefully (no broken img)
- Edge case: user has no email → field hidden or shows placeholder
- Error path: logout fails on server → local state still cleared, user sees logged-out state

**Verification:**
- Account page appears as first entry in settings index (order: 0)
- Both authenticated and unauthenticated states render correctly
- Logout clears auth state and navigates away

---

- [ ] **Unit 6: i18n translations**

**Goal:** Add translation keys for the account page.

**Requirements:** R6

**Dependencies:** None (can be done in parallel)

**Files:**
- Modify: `packages/i18n/src/locales/en/settings.yaml`
- Modify: other locale files (at minimum `zh-Hans`, others as TODOs)

**Approach:**
- Add under `pages:` in `settings.yaml`:
  ```yaml
  account:
    title: Account
    description: View your profile and manage your account
    notLoggedIn: Sign in to view your account and access all features
    login: Log in
    logout: Log out
    fluxBalance: Flux Balance
    viewFluxDetails: View details
    signedInAs: Signed in as
  ```
- Add equivalent keys in `zh-Hans/settings.yaml`
- Add TODOs or placeholder entries for other locales
- Update the controls island tooltip for the authenticated state if changed (e.g., from "logout" to "account")

**Patterns to follow:**
- Existing `pages.connection.title`/`.description` pattern in `settings.yaml`

**Test scenarios:**
- Happy path: all English keys resolve correctly in the account page
- Edge case: missing translation in non-English locale falls back to English

**Verification:**
- No missing i18n key warnings in console
- Account page displays correct text in English

## System-Wide Impact

- **Interaction graph:** The bridge endpoint is a new server route that creates better-auth sessions — it touches the `session` table and deletes from `oauth_access_token`. The controls island auth button changes from logout-on-click to navigation, which shifts logout responsibility to the account page. The `electronAuthCallback` handler now has an additional HTTP call (bridge) before `fetchSession()`.
- **Error propagation:** Bridge endpoint errors surface as toast messages in the Electron renderer. All bridge 401 errors use a uniform message to prevent information leakage. Server-side `signOut()` failures during logout are swallowed (local state cleared regardless). The bridge endpoint uses the existing `ApiError` → `onError` handler chain.
- **State lifecycle risks:** If the bridge call succeeds but the client crashes before storing the session token, an orphan session is created in the `session` table. This is acceptable — better-auth sessions expire naturally. The token confusion race condition (OIDC token written to store before bridge completes) is eliminated by passing the OIDC token as a function argument, never writing it to `authStore.token`.
- **Security surface — threat model:**
  - *Local process intercepts OIDC token from unencrypted loopback callback* → mitigated by: client ID restriction, token expiry, idempotent bridge with TTL (limits replay window), HTTPS requirement for bridge call
  - *Brute-force or replay of OIDC tokens against the bridge* → mitigated by: rate limiter, token expiry, transaction-level locking, uniform 401 responses (no information leakage)
  - *Crafted `oauth_access_token` row escalates to arbitrary user* → mitigated by: only first-party OIDC provider creates these rows; `userId` is set by better-auth during the OIDC flow, not by the client
  - *Concurrent requests with same token mint multiple sessions* → mitigated by: database transaction with row lock on token lookup
- **API surface parity:** Web already works (uses session cookies). Electron gains parity via the bridge. Mobile (Capacitor) has the same OIDC token problem and could use the bridge in the future (would need client ID allowlist expansion).
- **Integration coverage:** The full Electron flow (IPC → bridge → store → fetchSession) crosses multiple layers and should be tested end-to-end manually. The settings window ↔ main window localStorage sync via `storage` events should be verified manually.
- **Unchanged invariants:** Web auth flow unchanged. `authClient` configuration unchanged. OIDC PKCE flow unchanged. Loopback server behavior unchanged. better-auth config unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| better-auth internal API for session creation may not be public/stable | **Highest-risk unknown.** Investigate `auth.api` types/source first in Unit 1 before writing the endpoint. Fallback: construct a synthetic internal REST call, or use raw DB insert with proper session fields + trigger `databaseHooks` manually |
| Settings window IPC is not truly window-namespaced (relies on global `ipcMain`) | This is the current architecture (confirmed by TODO in code). If eventa adds window namespacing later, the account page login will need adjustment. Document this coupling |
| Cross-window localStorage sync depends on `storage` event | `useLocalStorage` from VueUse handles this. **Assumption**: controls-island-auth-button component stays mounted while main window is alive (it is part of the persistent controls island overlay). If unmounted, the callback handler won't fire and localStorage won't update |
| Rate limiter `keyGenerator` uses spoofable `x-forwarded-for` header | Pre-existing issue affecting all `/api/auth/*` routes, not introduced by this plan. Mitigated for the bridge by client ID restriction and single-use enforcement. Fixing the rate limiter key to use `getConnInfo()` is a recommended separate improvement |
| Orphan session accumulation from repeated login/logout cycles | better-auth sessions expire naturally (default ~7 days). Single-use token enforcement limits sessions to one per OIDC token. Acceptable for initial implementation; session cleanup job is a future improvement |

## Documentation / Operational Notes

- Update `apps/server/docs/ai-context/auth-and-oidc.md` to document the bridge endpoint and the updated Electron flow
- Document the session renewal follow-up in the existing TODO list at `docs/superpowers/plans/2026-03-29-oidc-auth-improvements.md`

## Sources & References

- **Origin document:** [docs/superpowers/specs/2026-03-30-electron-account-flux-design.md](docs/superpowers/specs/2026-03-30-electron-account-flux-design.md)
- **OIDC implementation record:** [docs/superpowers/plans/2026-03-29-oidc-auth-improvements.md](docs/superpowers/plans/2026-03-29-oidc-auth-improvements.md)
- **Server auth context:** [apps/server/docs/ai-context/auth-and-oidc.md](apps/server/docs/ai-context/auth-and-oidc.md)
- Related files: `apps/server/src/app.ts`, `apps/server/src/libs/auth.ts`, `apps/server/src/schemas/accounts.ts`, `packages/stage-ui/src/libs/auth.ts`, `packages/stage-ui/src/stores/auth.ts`
