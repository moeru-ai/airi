# LLM/TTS router codex review — deferred follow-ups

Codex independent review (2026-05-15) on commit `1bb0aab2f` returned 12
findings. Applied 3 HIGH inline (see commits after `1bb0aab2f`). The 9
remaining findings are deferred — each evaluated through the AGENTS.md
"外部建议 3 问过滤" and tracked here per "拒绝时留痕" rule.

## Applied inline (HIGH severity)

1. **Client abort signal not threaded into `llmRouter.route()`** — fixed in
   `apps/server/src/routes/openai/v1/index.ts`. `c.req.raw.signal` now flows
   into both the router and the legacy `fetch()` fallback. Prevents the
   "client disconnects but upstream keeps generating + burning paid quota"
   leak.
2. **Failed upstream response bodies not drained** — fixed in
   `apps/server/src/services/domain/llm-router/router.ts`. Every non-2xx fallback
   path now calls `response.body?.cancel()` before continuing. Prevents
   socket-pool exhaustion under fallback storms.
3. **SSML voice attribute injection** — fixed in
   `apps/server/src/services/adapters/tts/azure.ts`. Voice id is
   regex-validated (`^[a-z0-9-]+$/i`) before SSML interpolation; invalid
   values throw `BAD_REQUEST`. Prevents attribute-context breakout under
   the server's Azure credential.

## Deferred — rationale per finding

### #4: in-flight `loadFresh()` can repopulate cache after `invalidate()`

**Severity**: MEDIUM. **Decision**: defer to v1.x.
**Rationale**: race window is bounded by the Pub/Sub-driven invalidate
firing during a concurrent TTL-driven reload. In practice the operator
revokes a key, the active in-flight load was already reading the
*pre-revocation* config and so writes back the old key state. Worst case
the stale config lives until next TTL expiry (5s). Acceptable for v1
given the 5s SLO target — not a security hole, just a propagation hiccup.
Fix shape (generation counter on `loadFresh`) is well-known and cheap; do
it the next time someone touches `config-loader.ts`.

### #5: no single-flight on concurrent cache miss

**Severity**: MEDIUM. **Decision**: defer.
**Rationale**: configKV's underlying Redis read is single-digit-ms in
practice; even a 10-request stampede is 10 cheap reads. The plan's
adversarial reviewer flagged this; we accepted because the cure
(promise-dedup) adds state with its own race window and rarely matters
at airi's current QPS. Revisit if `airi.gen_ai.gateway.config.reload`
spikes after a Pub/Sub burst.

### #6: `fullChainTimeoutMs` not enforced as a hard cap

**Severity**: MEDIUM. **Decision**: apply in next iteration.
**Rationale**: legit bug — per-attempt × N keys can exceed the configured
60s cap. Worth fixing but requires a route-level abort controller that
composes with the per-attempt one; not a 5-minute change. Track here so
it doesn't get lost.

### #7: 200-with-error-envelope not detected

**Severity**: MEDIUM. **Decision**: reject for v1.
**Rationale**: codex flagged this without citing real evidence of any
v1 provider doing it. The four configured providers (OpenRouter, Azure,
DashScope, Volcengine) return proper HTTP status codes for errors. Adding
body-shape detection across LLM + 3 TTS adapters adds complexity that
guards against a hypothetical. "外部建议 3 问过滤" (c): would create
duplicated parsing logic in every adapter. Revisit if a provider is added
that does return 200-with-error.

### #8: incomplete plaintext zeroization in `encryptKey()`

**Severity**: MEDIUM. **Decision**: partial accept — fix in next iteration.
**Rationale**: codex is right that `encryptKey` leaves `plaintextBytes`
uncleared. Fix is `try/finally { plaintextBytes.fill(0) }` — apply in
v1.x. Note: rendered `Authorization: Bearer <key>` strings cannot be
zeroized once V8 has interned them as JS strings; that limitation is
fundamental and worth documenting in `envelope-crypto.ts` JSDoc.

### #9: provider API keys via argv in `seed-router-config.ts`

**Severity**: MEDIUM. **Decision**: apply.
**Rationale**: legit security issue — keys appear in `ps` output and
shell history. Switch to env var input (`OPENROUTER_KEY` etc.) and
remove the `--openrouter-key` flag. Will apply in next iteration to the
seed script; the script is operator-only and runs locally so impact is
bounded but the principle is right.

### #10: `e2e-llm-router.ts` debug fetch logs auth header prefix

**Severity**: MEDIUM. **Decision**: apply now (trivial).
**Rationale**: legit. The 30-char prefix can identify accounts. Fix shape:
replace `${auth.slice(0, 30)}...` with `<set>`. Apply in next commit.

### #11: identical `current` / `previous` master key not rejected

**Severity**: LOW. **Decision**: apply.
**Rationale**: defensive guard, ~3 lines. Will apply in next iteration.

### #12: Pub/Sub handler unbounded JSON parse

**Severity**: LOW. **Decision**: defer.
**Rationale**: Redis is on the trusted private network in our deployment
model; HMAC was already deferred from the plan (P2 finding from
ce-doc-review). Size guard is small but its security value is contingent
on the same untrusted-Redis threat we explicitly accepted. Mark as
follow-up when HMAC is added in the same iteration.

## Tracked

- v1.x cleanup pass (issues #6, #8, #9, #10, #11): bundled commit before
  next ship.
- v1.x or v2 (issues #4, #5, #7, #12): revisit when ops data shows the
  underlying assumption broke.
