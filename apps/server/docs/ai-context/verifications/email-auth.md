# Verification: email auth via Resend

Status: **Path 1 verified**, Path 2/3 unverified.
Last attempted: 2026-04-28
Owner: rbxin2003@gmail.com

> **Note (2026-04-28):** UI base path migrated from the original
> `/_ui/server-auth/` prefix to `/auth/` (commit `d5f215134`). All Vite-built
> asset URLs and SPA routes are now served under `/auth/`. The verification
> log below has been rewritten to use the current routes; the prior path
> remains valid only for historical builds tagged before that commit.

## What's verified end-to-end

### Path 1 — Sign-up + verify email + sign-in (✅ 2026-04-27)

Tested with a live Resend API key, real Outlook inbox.

| Step | Evidence |
|---|---|
| `POST /api/auth/sign-up/email` (raw fetch) | `200` with `{ token: null, user: { ..., emailVerified: false } }` for `rbxin2003+probe@outlook.com` and `rbxin2003@outlook.com` |
| Resend dispatch | server log `<-- POST /api/auth/sign-up/email` → `--> POST /api/auth/sign-up/email 200 5s` (Resend API call latency, no errors logged from `services:email`) |
| Inbox delivery | User confirmed receipt at `rbxin2003@outlook.com` with subject "Verify your email", containing link `http://localhost:3000/api/auth/verify-email?token=eyJ...&callbackURL=%2F` |
| Click verify link | `GET /api/auth/verify-email?token=...&callbackURL=/` → `302` (redirect honored) |
| `emailVerified` flips to `true` | follow-up `POST /api/auth/sign-in/email` for the same user → `200` with `{ redirect: false, token: <session>, user: { ..., emailVerified: true, updatedAt > createdAt } }` |
| UI sign-up form submit | navigated `http://localhost:5174/auth/sign-up`, filled form via chrome-devtools, click `Create account` → server log `POST /api/auth/sign-up/email 200 2s` → browser landed on UI's verify-email page |

Two follow-up issues surfaced and were fixed in the same session:

1. **vue-i18n linked-format crash** — placeholder `you@example.com` parsed as a linked-message reference. Escaped to `you{'@'}example.com` in `packages/i18n/src/locales/en/server/auth.yaml`.
2. **Email link landed on `http://localhost:3000/` (404)** when there was no OIDC context, because Better Auth resolves bare `/` callback against `API_SERVER_URL`. Fixed in `apps/ui-server-auth/src/pages/sign-up.vue` and `sign-in.vue` by passing an absolute UI URL (`${origin}/auth/verify-email?verified=true`) when no OIDC params are present.
3. **API root + 404 friendliness** — added structured JSON for `GET /` and `notFound()` in `apps/server/src/app.ts` so stale email links / scanners hit a clear pointer instead of hono's default `404 Not Found` HTML.
   - Verified with `curl http://localhost:3000/` → `200 {"service":"airi-api",...}` and `curl http://localhost:3000/some/random/path` → `404 {"error":"NOT_FOUND",...}`.

### Path 2 — Forgot + reset password (✅ 2026-04-27)

Tested with `rbxin2003+reset@outlook.com` (live Resend account). The bare `rbxin2003@outlook.com` is on Resend's suppression list and cannot be used for QA — see `~/.claude/projects/<project>/memory/reference_resend.md`.

| Step | Evidence |
|---|---|
| Sign-up `rbxin2003+reset@outlook.com` | `POST /api/auth/sign-up/email 200 2s`; UI navigated to `/verify-email?email=...` |
| Verify email | clicked link from real Outlook inbox; `GET /api/auth/verify-email?token=...&callbackURL=http://localhost:5173/auth/verify-email?verified=true` → 302 → UI shows "Email verified" |
| `POST /api/auth/request-password-reset` from UI | server log `200 3s`; UI shows "If rbxin2003+reset@outlook.com matches an account, a reset link is on the way" |
| Resend dashboard | `Reset your Project AIRI password` to `rbxin2003+reset@outlook.com` → `last_event: delivered` |
| Click reset link | `GET /api/auth/reset-password/<token>?callbackURL=http://localhost:5173/auth/reset-password` → 302 → UI form rendered with `?token=<token>` |
| Submit new password | `POST /api/auth/reset-password?token=...` → 200; UI shows "Password updated" |
| Sign in with new password | `POST /api/auth/sign-in/email` → `200` `{ token: <session>, user: { emailVerified: true, updatedAt: 2026-04-27T06:57:59.387Z } }` |

Two follow-up issues surfaced and were fixed in the same session:

1. **`apps/ui-server-auth` defaulted to production `https://api.airi.build`** because `VITE_SERVER_URL` was unset. Fixed by adding `apps/ui-server-auth/.env.development.local` → `VITE_SERVER_URL=http://localhost:3000`. Detected via `window.fetch` patching showing prod hostname; saved to `~/.claude/projects/<project>/memory/project_ui_server_auth_dev_env.md`.
2. **Better Auth's `originCheck` rejected `http://localhost:5173/...` callbackURLs** when the request came from a top-level GET (no Origin/Referer that matches dev origins). Fixed by adding `localhost:5173 / 5174 / 4173` to `ALWAYS_TRUSTED_AUTH_ORIGINS` in `apps/server/src/utils/origin.ts`. Prod-safe: those addresses are unreachable in prod, so the static list does not expand attack surface.

### Path 3 — Email + password sign-in via OIDC (partially verified)

`POST /api/auth/sign-in/email` was exercised directly to confirm `emailVerified` flips and a session token is issued, but the full UI-driven OIDC handoff (stage app → `/oauth2/authorize` → ui-server-auth → back to stage app with tokens) has NOT been tested in this session.

## What still needs running

### Path 2 — Forgot + reset password

1. From `/sign-in`, click "Forgot password?" → `/forgot-password`.
2. Submit the registered email. Expect `POST /api/auth/request-password-reset` returns 200, an email arrives ("Reset your Project AIRI password").
3. Click the email link. Expect server validates and 302s to `${UI}/auth/reset-password?token=<token>`.
4. Submit a new password. Expect `POST /api/auth/reset-password?token=...` returns 200; UI shows "Password updated".
5. Sign in with the new password and confirm session is issued.

### Path 3 — OIDC-bridged sign-in

1. Open a stage app (e.g. `apps/stage-web`) → triggers OIDC `/oauth2/authorize` → bounces to `ui-server-auth /sign-in?...`.
2. Submit email + password against the verified user. Expect session cookie set; browser redirects to the OIDC continuation URL; stage app yields `code` → token exchange.
3. Stage app shows a signed-in state.

## Until Path 2 + 3 are ticked

Treat the email-auth feature as **partially shipped**. Sign-up + verify-email is production-quality; password reset and OIDC bridging are code-complete but not load-bearing without an end-to-end run.

## Known gaps deferred to follow-up

- Magic link UI (server-side wired, no front-end entry yet).
- Change-email front-end flow.
- Email i18n (only English).
- Resend bounce / complaint webhook ingestion.
- Email send audit log in `request_log`.
- dev/prod served-from parity (dev runs Vite at `:5174`; prod expects ui-server-auth dist under `apps/server/public/ui-server-auth`).
