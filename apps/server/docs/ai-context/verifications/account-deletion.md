# Verification: account deletion

Status: **end-to-end verified (2026-04-28)** — UI → email → click → server
soft-delete pipeline → success page all confirmed in a live run. DB-row
inspection (`select deleted_at` on each business table) and same-email
re-registration smoke-test are recommended but not yet captured in this
record.
Last attempted: 2026-04-28
Owner: rbxin2003@gmail.com

## Live trace (2026-04-28)

Server log captured during a live deletion of `userId=2ylsWBfP1UdjenkxBSDCyQkjarzE6ZAk`:

```
<-- POST /api/auth/delete-user
--> POST /api/auth/delete-user 200 4s
<-- GET /api/auth/delete-user/callback?token=sb7614...&callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fdelete-account
[user-deletion] starting user deletion        { userId=2ylsWBfP1UdjenkxBSDCyQkjarzE6ZAk reason=user-requested handlerCount=5 }
[user-deletion] handler completed             { handler=stripe     userId=... durationMs=1297 }
[user-deletion] Flux balance soft-deleted...  { userId=... clearedFlux=500 }
[user-deletion] handler completed             { handler=flux       userId=... durationMs=526 }
[user-deletion] Provider configs soft-deleted { userId=... count=0 }
[user-deletion] handler completed             { handler=providers  userId=... durationMs=260 }
[user-deletion] Characters / likes / bookmarks soft-deleted { userId=... characters=0 likes=0 bookmarks=0 }
[user-deletion] handler completed             { handler=characters userId=... durationMs=787 }
[user-deletion] Chats / messages soft-deleted { userId=... chats=0 messages=0 }
[user-deletion] handler completed             { handler=chats      userId=... durationMs=270 }
[user-deletion] user deletion handlers completed { userId=... reason=user-requested }
--> GET /api/auth/delete-user/callback?... 302 8s
<-- GET /auth/delete-account
--> GET /auth/delete-account 200 1ms
```

What this proves:
- 5 handlers run in registration order, ascending priority (stripe → flux → providers → characters → chats).
- Total handler time ~3.1s (mostly Stripe: 1.3s for the network round-trip).
- Verification token consumed exactly once; the callback redirected (302) to the success page.
- `clearedFlux=500` confirms the Flux handler picked up the actual balance.
- `count=0` for providers / characters / chats reflects the test user not having those records — empty soft-delete is a valid no-op.

## Known gotcha — UI dist staleness

`apps/server/public/ui-server-auth/` is a build artifact (Vite `outDir`). New
pages added under `apps/ui-server-auth/src/pages/` only show up after
running `pnpm -F @proj-airi/ui-server-auth build`. Symptom of forgetting:
the success page returns `200` with the SPA HTML but renders blank because
vue-router never registered the route. Re-build → fixes.

## What is verified

| Layer | Evidence | Date |
|---|---|---|
| Schema migration generated | `apps/server/drizzle/0009_perpetual_lilandra.sql`: 11 `DROP CONSTRAINT` + 7 `ADD COLUMN deleted_at` (no destructive ALTER beyond FK drop) | 2026-04-28 |
| Server typecheck | `pnpm -F @proj-airi/server typecheck` exits clean | 2026-04-28 |
| Monorepo typecheck | `pnpm typecheck` exits clean across all packages | 2026-04-28 |
| Lint | `pnpm lint` reports 0 errors in deletion-service / handler / UI files | 2026-04-28 |
| Deletion service unit tests | `pnpm exec vitest run apps/server/src/services/user-deletion` → `2 files / 14 tests pass` (registry priority order, abort-on-error, serial execution, idempotency, per-service `deleteAllForUser` correctness) | 2026-04-28 |
| Architecture refactor | Domain knowledge moved out of `*-deletion-handler.ts` files into each business service's own `deleteAllForUser` method. Registry retained as a thin scheduler. `auth → userDeletionService → 5 business services` (auth and services no longer depend on each other). | 2026-04-28 |
| Server full test suite | `pnpm -F @proj-airi/server exec vitest run` → 244/245 pass; the single failure (`origin.test.ts`) is pre-existing on `main` and unrelated | 2026-04-28 |
| UI typecheck | `pnpm -F @proj-airi/stage-pages typecheck` and `pnpm -F @proj-airi/ui-server-auth typecheck` both clean | 2026-04-28 |
| Live server-side trace | See "Live trace" section above — full pipeline ran against real DB + Stripe sandbox + Resend | 2026-04-28 |

## What is **not** verified yet (action items)

### Path A — Migration applies cleanly to live DB
**Command (run by user):**
```sh
pnpm -F @proj-airi/server db:push
```
**Expected:** Drizzle reports `Changes applied` for 11 FK drops + 7 column additions on the local Postgres pointed to by `DATABASE_URL`.
**Risk:** if any business table currently has rows whose `userId` references a now-missing user (orphans from older bugs), DROP CONSTRAINT will succeed (unlike ADD CONSTRAINT). No data loss expected.

### Path B — Server boots with deletion service wired
**Command:**
```sh
pnpm -F @proj-airi/server dev
```
**Expected log lines:**
- `injeca` resolves `services:userDeletion` without error
- `services:auth` resolves successfully (depends on userDeletionService)
- `Server started` log line appears
**Failure mode:** if the Stripe SDK construction throws at boot, the deletion service crashes the process. Mitigation: `STRIPE_SECRET_KEY` is optional — handler tolerates `null`.

### Path C — End-to-end deletion flow (UI → email → DB)
**Setup:**
1. Server up (Path B), UI up (`pnpm -F @proj-airi/stage-web dev` with `VITE_SERVER_URL=http://localhost:3000`)
2. `RESEND_API_KEY` valid, use `rbxin2003+delete@outlook.com` (bare address suppressed — see Resend memory)
3. Pre-populate the user with non-trivial data so soft-delete has something to mark:
   - Register user
   - Have flux balance > 0 (initial grant covers this)
   - Connect a provider via settings UI
   - Create one character
   - (Optional) Set up a Stripe test sub via the billing flow

**Steps + assertions:**

| # | Action | Expected | DB / API check |
|---|---|---|---|
| 1 | Settings → Account → Danger Zone → click "Delete account" | Inline confirm form appears | DOM-only |
| 2 | Type wrong email | Confirm button disabled | DOM-only |
| 3 | Type correct email + click confirm | Server log: `POST /api/auth/delete-user 200`. UI shows "Check {email} for the deletion link" | `select * from verification where identifier like 'delete-account-%'` returns one row |
| 4 | Open Resend inbox, click link in email | Browser navigates to `${API_SERVER_URL}/api/auth/delete-user/callback?token=...` then redirects to `/auth/delete-account` (success page) | server log: `[user-deletion] starting user deletion` → 5x `handler completed` → `user deletion handlers completed` → `internalAdapter.deleteUser` → `302` |
| 5 | Verify auth tables are gone (cascade) | `select * from "user" where email='...'` → empty | psql query |
| 6 | Verify business tables are soft-deleted (NOT cascade) | `select * from user_flux where user_id=$1` → row with `deleted_at IS NOT NULL` | psql query, $1 = old user.id |
| 7 | Same for stripe_customer, stripe_subscription, stripe_checkout_session, stripe_invoice | All `deleted_at IS NOT NULL` | psql query |
| 8 | Same for character (creator_id OR owner_id), user_provider_configs (owner_id), user_character_likes/bookmarks (user_id) | All matching rows have `deleted_at IS NOT NULL` | psql query |
| 9 | flux_transaction is **untouched** (audit) | `select count(*) from flux_transaction where user_id=$1` → unchanged from before deletion | psql query |
| 10 | Stripe API side: active sub canceled | Stripe dashboard or `GET /v1/subscriptions/$sub_id` → `status: "canceled"` | Stripe CLI or dashboard |
| 11 | Re-register with same email | Sign-up succeeds (unique constraint released by hard delete of `user` row) | server log: `POST /api/auth/sign-up/email 200`. New user gets a fresh user.id |
| 12 | Old soft-deleted business rows do **not** show up for the new user | `select * from user_flux where user_id=$1` (new id) is empty or has fresh row | psql query |

### Path D — Failure-mode smoke
**Setup:** kill Postgres mid-deletion (or simulate by wrapping a handler to throw)
**Expected:**
- `user-deletion` log: `handler failed; aborting deletion pipeline`
- `user` row still present (better-auth never reaches `internalAdapter.deleteUser`)
- soft-deleted rows from earlier handlers REMAIN soft-deleted (no rollback) — by design
- User can retry the deletion flow; idempotent handlers re-mark already-stamped rows as no-ops

## Known gaps

1. **No retry UI:** if Path D triggers, the user sees the API JSON error from `/delete-user/callback` instead of a friendly page. Acceptable for v1 (rare path); future hook can redirect to `/auth/delete-account?error=...`.
2. **No admin-triggered deletion:** the `reason: 'admin'` enum exists but no caller. Wire up in admin panel later.
3. **No rate limiting on `/api/auth/delete-user`:** uses the global `/api/auth/*` IP rate limit (`AUTH_RATE_LIMIT_MAX`). May want a tighter per-user cap (e.g. 1 attempt per hour) if abuse surfaces.
4. **Translations:** EN-only for new i18n keys (`server.auth.deleteAccount.*`, `settings.pages.account.danger.deleteAccount.modal.*`, `.message.emailSent`, `.error.fallback`). Other locales fall back to EN until translated.
5. **`flux_transaction` retention:** ledger now contains `user_id` strings that point to deleted users. No retention policy yet — open question for finance/legal.

## Re-verification cadence

When the deletion code path is touched (handler logic, schema, better-auth config), re-run Path C from scratch and update "Last attempted" + the table above.
