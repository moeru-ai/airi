# Electron Account Page & Flux Integration

**Date**: 2026-03-30
**Status**: Draft
**Scope**: Bug fix (OIDC → session bridge) + new account settings page + Electron flux access + controls island UX

## Problem

1. After OIDC login in Electron, the controls island auth button still shows the login icon instead of the user's avatar. Root cause: OIDC access tokens (`oauth_access_token` table) are incompatible with better-auth session tokens (`session` table), so `fetchSession()` silently fails.
2. No user profile/account page exists anywhere in the app.
3. Electron has no way to view Flux balance or manage credits.

## Design

### Part 1: OIDC → Session Bridge (Bug Fix)

**Root cause**: better-auth's `oidcProvider` plugin issues OAuth access tokens but does NOT create a better-auth session. The bearer plugin expects tokens that correspond to `session` table records. When the Electron app stores the OIDC access token and calls `fetchSession()` → `authClient.getSession()`, the server can't find a matching session → returns null → `isAuthenticated` stays false → all authenticated API calls fail.

**Fix — new server endpoint `POST /api/auth/oidc/session`**:

1. Accepts `Authorization: Bearer {oidc_access_token}` header
2. Validates the token against the `oauth_access_token` table → extracts `userId`
3. Creates a better-auth session for the user via `auth.api` internal adapter
4. Returns the session token in the response

**Electron client flow change** (`controls-island-auth-button.vue` callback handler):

1. OIDC callback → receive `accessToken`, `refreshToken`, `idToken`, `expiresIn`
2. Call `POST /api/auth/oidc/session` with OIDC access token as Bearer header
3. Receive session token from response
4. Store session token in `authStore.token` (replaces the OIDC access token)
5. Optionally store OIDC refresh token for token renewal
6. Call `fetchSession()` → now works because token matches a `session` table record
7. `isAuthenticated` becomes true → avatar displays correctly
8. All authenticated API calls (flux, etc.) work

### Part 2: Account Settings Page

**Location**: `packages/stage-pages/src/pages/settings/account/index.vue` (shared by web & Electron)

**Route meta**:
```yaml
meta:
  layout: settings
  settingsEntry: true
  titleKey: settings.pages.account.title
  descriptionKey: settings.pages.account.description
  icon: i-solar:user-circle-bold-duotone
  order: 0
```

**Authenticated state** — read-only display:
- User avatar (circular, from OAuth provider's `user.image`)
- User name (`user.name`)
- User email (`user.email`)
- Flux balance summary card showing current credits + RouterLink to `/settings/flux`
- Logout button (red/destructive style, bottom of page)

**Unauthenticated state**:
- Prompt text explaining login is needed
- Login button that sets `authStore.needsLogin = true`

**Logout logic**:
- Call `signOut()` from `@proj-airi/stage-ui/libs/auth`
- On Electron (`isStageTamagotchi()`): additionally invoke `electronAuthLogout` IPC to clean up main process state
- Navigate back to settings index after logout

### Part 3: Flux Page Access

`packages/stage-pages/src/pages/settings/flux.vue` already exists and is NOT excluded by stage-tamagotchi's VueRouter config. Electron can already route to `/settings/flux`.

No `settingsEntry: true` is added to flux.vue — it serves as a sub-page accessed from the account page's Flux summary card (Option A navigation structure).

### Part 4: Controls Island Auth Button UX

**Current behavior**:
- Not authenticated → click triggers `startLogin()` via IPC
- Authenticated → click triggers `logout()` directly

**New behavior**:
- Not authenticated → click triggers `startLogin()` via IPC (unchanged)
- Authenticated → click navigates to `/settings/account` (via `electronOpenSettings` IPC with route param)

Logout moves to the account page, preventing accidental logout from the floating controls island.

Avatar display logic (3-state: avatar image / green checkmark / login icon) remains unchanged.

### Part 5: i18n

New translation keys in `packages/i18n`:

- `settings.pages.account.title` — "Account"
- `settings.pages.account.description` — "View your profile and manage your account"
- `settings.pages.account.notLoggedIn` — prompt to log in
- `settings.pages.account.login` — "Log in"
- `settings.pages.account.logout` — "Log out"
- `settings.pages.account.fluxBalance` — "Flux Balance"
- `settings.pages.account.viewFluxDetails` — "View details"
- `settings.pages.account.signedInAs` — "Signed in as"

## Files to Create

- `apps/server/src/routes/oidc/session.ts` — new OIDC → session bridge endpoint
- `packages/stage-pages/src/pages/settings/account/index.vue` — account settings page

## Files to Modify

- `apps/server/src/app.ts` — register new OIDC session route
- `apps/stage-tamagotchi/src/renderer/components/stage-islands/controls-island/controls-island-auth-button.vue` — change authenticated click to navigate, update callback to use session bridge
- `packages/i18n/src/locales/en.json` (and other locale files) — add account page translations
- `packages/stage-ui/src/libs/auth.ts` — add helper for OIDC → session exchange (used by Electron callback)

## Out of Scope

- Profile editing (name, avatar changes)
- Account deletion
- Adding `settingsEntry` to flux.vue
- Web-side changes to HeaderAvatar.vue (already works)
