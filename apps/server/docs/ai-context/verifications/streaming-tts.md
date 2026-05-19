# Bidirectional streaming TTS — verification

Verification artifacts for the airi-side proxy at `/api/v1/audio/speech/ws`
and the unspeech-side bridge at `/v1/audio/speech/stream`, both new in
this session (server-dev branch, 2026-05-15).

## Coverage status

| User path | Code wired | Has fresh evidence |
|---|---|---|
| Unspeech ws upgrade (HTTP 101) | ✅ | ✅ smoke 2026-05-15 |
| Unspeech rejects malformed first frame as JSON `error` event | ✅ | ✅ smoke 2026-05-15 |
| Unspeech rejects unsupported backend as JSON `error` event | ✅ | ✅ smoke 2026-05-15 |
| Unspeech rejects missing `Authorization` as JSON `error` event | ✅ | ✅ smoke + integration `TestBridge_ErrorEventOnMissingApiKey` 2026-05-15 |
| Unspeech post-upgrade errors no longer write to hijacked HTTP conn | ✅ | ✅ smoke (server log clean) + integration error-event test 2026-05-15 |
| Unspeech `finish` waits for upstream completion (codex CRITICAL #1) | ✅ | ✅ integration `TestBridge_FinishWaitsForUpstreamCompletion` 2026-05-15 |
| Unspeech `cancel` after `finish` reaches upstream (codex follow-up) | ✅ | ✅ integration `TestBridge_CancelAfterFinish` 2026-05-15 |
| apps/server proxy forwards start/text/finish + streams audio back | ✅ | ✅ integration `audio-speech-ws route.test.ts > forwards start/text/finish` 2026-05-15 |
| apps/server bills from `usage.text_words` when upstream returns it | ✅ | ✅ integration ditto (asserts `accumulate({units: 42})`) 2026-05-15 |
| apps/server falls back to input-char count when usage absent | ✅ | ✅ integration `falls back to input-char count` 2026-05-15 |
| apps/server pre-flight rejects `insufficient_flux` | ✅ | ✅ integration `refuses ... insufficient_flux` 2026-05-15 |
| apps/server rejects `streaming_tts_not_configured` when config missing | ✅ | ✅ integration `refuses ... streaming_tts_not_configured` 2026-05-15 |
| stage-ui `streamingSynthesize` resolves on session.finished | ✅ | ✅ unit `streaming-session.test.ts > resolves with concatenated audio` 2026-05-15 |
| stage-ui rejects on close-without-session.finished (codex HIGH #2) | ✅ | ✅ unit `rejects when the ws closes before session.finished` 2026-05-15 |
| stage-ui rejects on `error` event with code/message | ✅ | ✅ unit `rejects with the upstream code/message on an error event` 2026-05-15 |
| stage-ui aborts cleanly on signal abort (sends `cancel`) | ✅ | ✅ unit `aborts the session and rejects with AbortError on signal abort` 2026-05-15 |
| Stage.vue streaming provider end-to-end with audio playback | ✅ | ⏳ pending — requires logged-in user + real Volcengine key |
| Full happy path with real Volcengine upstream | ✅ | ⏳ pending — gated `TestBidirectionalStream_Integration` in unspeech (requires `VOLCENGINE_API_KEY`) |

The ⏳ rows are the only paths still requiring live Volcengine
credentials. Every other production code path (post-upgrade error
handling, bridge state machine including the codex-found bugs, proxy
billing, proxy pre-flight, browser-side session lifecycle including the
partial-as-success fix) is covered by automated tests that run on every
`go test` / `pnpm exec vitest run` without external dependencies.

## Smoke: unspeech protocol surface (no upstream call)

- **Scenario**: walk through every error path in the new
  `/v1/audio/speech/stream` route and confirm each one delivers a clean
  JSON `error` event followed by a policy-violation close frame, instead
  of dumping a stack trace over the hijacked websocket bytes (the
  pre-fix behavior — codex review item #5 + smoke discovery).
- **Command**:
  ```bash
  cd /Users/luoling8192/Git/moeru-ai/unspeech
  go build -o /tmp/unspeech ./cmd/unspeech
  /tmp/unspeech &  # listens on :5933
  node /tmp/smoke-streaming-tts.mjs
  kill %1
  ```
  The smoke script is `/tmp/smoke-streaming-tts.mjs` (see "smoke script"
  appendix below).
- **Expected output**: three `PASS` lines, each carrying a JSON `error`
  event with a stable `code` discriminator.
- **Actual output** (unspeech `26817b6` + WIP, 2026-05-15):
  ```
  [bad-first-frame] PASS
          events: [{"event":"error","code":"invalid_first_frame","message":"first frame must be event=start"}]
  [unsupported-backend] PASS
          events: [{"event":"error","code":"unsupported_backend","message":"streaming is only supported for backend=volcengine"}]
  [volcengine-no-auth] PASS
          events: [{"event":"error","code":"missing_api_key","message":"missing X-Api-Key in Authorization header"}]
  ```
- **Server log diff vs pre-fix**: before the post-upgrade error fix,
  the same scenarios produced `response.status=500` lines plus
  `echo: http: response.WriteHeader on hijacked connection` stack
  traces in the unspeech log. After the fix, every request returns
  `response.status=200` (handler returns `mo.Ok` so the echo error
  middleware never tries to write HTTP). Clean.
- **Environment**: unspeech `26817b6` with WIP from this session, airi
  `4f2ed81a3`, Node v24, local macOS.

## Pending: live happy path (operator needs Volcengine key)

The smoke scenarios above cover everything that can run without a real
Volcengine API key. To finalise the verification an operator with a
production-tier Volcengine key needs to run the live happy path. The
exact commands and assertions are below — paste this output back here
once it lands.

### Prerequisite: seed `STREAMING_TTS_UPSTREAM`

```bash
curl -sS -X POST http://localhost:3000/api/admin/config/router \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slices": [{
      "kind": "streaming-tts",
      "upstreamURL": "ws://airi-unspeech.railway.internal:5933/v1/audio/speech/stream",
      "plaintextKey": "<VOLCENGINE_TTS_API_KEY>"
    }]
  }' | jq
```

The server envelope-encrypts the plaintext key under AAD
`{ modelName: 'streaming-tts', keyEntryId: 'volcengine-prod-1' }` and
writes `STREAMING_TTS_UPSTREAM`. Add `"dryRun": true` to preview the
ciphertext length without committing.

To point at a different unspeech instance later, repeat the call with a
different `upstreamURL`. To rotate the upstream key, pass
`"keyEntryId": "volcengine-prod-N"` (the audio-speech-ws route always
reads `keys[0]`, so a write replaces the active key).

`$ADMIN_TOKEN` is a Bearer token for an account whose email is in
`ADMIN_EMAILS` and is verified.

### Scenario L1: streaming session happy path

- **User path**: user types a chat message → LLM streams → speech
  pipeline opens streaming ws → audio plays back as upstream synthesises.
- **Setup**: log in as a user with ≥1 flux. In speech settings, pick
  "Official Streaming Speech Provider", model `volcengine/seed-tts-2.0`,
  any Volcengine voice (e.g. `zh_female_shuangkuaisisi_moon_bigtts`).
- **Command** (manual): send a chat message. Observe browser devtools
  Network tab → WS frames panel.
- **Expected**:
  1. Single ws frame `start` (text) sent by client.
  2. Single ws frame `text` (text) sent by client carrying the LLM
     output as input.
  3. Single ws frame `finish` (text) sent by client.
  4. Server emits `session.started` (text) within ~500ms.
  5. Server emits multiple binary frames totalling > 0 bytes within
     ~1.5s of `start` (the streaming first-packet latency we care
     about — should be lower than a buffered REST round-trip).
  6. Server emits `session.finished` (text) with
     `payload.usage.text_words > 0`.
  7. Client closes the ws with code 1000.
  8. Audio plays cleanly through the stage's `playbackManager` (no
     truncation, no stuck animation).
- **Billing check** (after the request lands):
  ```sql
  SELECT * FROM flux_transaction WHERE user_id = '<user-id>'
   ORDER BY created_at DESC LIMIT 1;
  ```
  Expected: one row with `meter = 'tts'` (or whatever the meter name
  resolves to), `amount` matching `floor(text_words / FLUX_PER_1K_CHARS_TTS *
  1000)` (cross-check with the ttsMeter accumulate path).
- **Actual output**: ⏳ pending operator run.

### Scenario L2: abort mid-synthesis cancels upstream

- **User path**: user clicks stop while audio is still playing → ws
  closes → upstream session terminated → no stray flux debit.
- **Command** (manual): in dev console, trigger the chat abort
  controller mid-stream.
- **Expected**:
  1. Client sends `cancel` (text) frame.
  2. Server bridge forwards `CancelSession` (event=101) upstream.
  3. Volcengine emits `SessionCanceled` (event=151); server-side bridge
     does NOT block waiting for it (documented v1 limitation).
  4. apps/server proxy closes ws cleanly with code 1000.
  5. No `session.finished` event reaches client → no billing call
     fires → no new `flux_transaction` row (verified via the same SQL
     query as L1).
- **Actual output**: ⏳ pending operator run.

### Scenario L3: truncated upstream surfaces as error, not silent success

- **User path**: simulate an upstream truncation (kill unspeech mid-session)
  → client should error out, not play partial-then-go-silent.
- **Command** (manual): start full stack, begin a session, then
  `pkill -f unspeech` while audio is still arriving.
- **Expected**:
  1. Client's ws receives a close frame without `session.finished`.
  2. `streamingSynthesize()` rejects with
     `streaming_tts_closed: ... (received N bytes without session.finished)`.
  3. Stage.vue catches the rejection, logs the diagnostic, returns
     null for the segment.
  4. Console shows the new diagnostic line from
     `[Speech Pipeline] tts() failed` with provider / model / voice
     context. (Codex review fix #6.)
- **Actual output**: ⏳ pending operator run.

## Pre-existing static checks (refreshable on every commit)

- `go build ./...` in `unspeech` — ✅ 2026-05-15.
- `go test ./pkg/backend/volcengine/...` in `unspeech` — ✅ 2026-05-15
  (v3frame round-trip tests).
- `pnpm -F @proj-airi/server typecheck` — ✅ 2026-05-15.
- `pnpm -F @proj-airi/server exec vitest run` — ✅ 344/344 pass.
- `pnpm -F @proj-airi/stage-ui typecheck` — ✅ 2026-05-15.
- `pnpm -F @proj-airi/stage-ui exec vitest run --project node` — ✅
  375/375 pass. (Browser project not run; pre-existing Playwright env
  gap unrelated to this change.)
- `pnpm -F @proj-airi/stage-tamagotchi typecheck` — ✅ 2026-05-15.
- `pnpm -F @proj-airi/stage-web typecheck` — ✅ 2026-05-15.
- `pnpm exec eslint <changed-files>` — ✅ clean after autofix.

## Known v1 limitations (recorded so future verifications track them)

- **No fallback on streaming upstream failure**. Live ws can't
  transparently switch upstream mid-session, so v1 uses the first key
  only. Codex MEDIUM #3.
- **JWT in `?token=` query**. Same pattern as `/ws/chat`; reusable
  bearer in URL is recorded by access logs. Codex MEDIUM #4. Worth
  rotating to short-lived tickets in a follow-up.
- **`cancel` ack not surfaced**. Server does not wait for upstream
  `SessionCanceled` before closing. Documented in the wire spec.
- **Per-segment ws (not session-level)**. stage-ui opens a fresh ws
  per speech segment; future Phase B refactor can keep one ws per LLM
  intent and chunk on `sentence.end` for true play-as-you-receive.

## Smoke script appendix

The file `/tmp/smoke-streaming-tts.mjs` used in the smoke run:

```js
import WebSocket from '<airi-root>/node_modules/.pnpm/ws@*/node_modules/ws/wrapper.mjs'

const URL = 'ws://localhost:5933/v1/audio/speech/stream'

function runScenario(name, send, expect) { /* ... see /tmp/... */ }

const scenarios = [
  ['bad-first-frame', ws => ws.send(JSON.stringify({ event: 'text', text: 'hi' })),],
  ['unsupported-backend', ws => ws.send(JSON.stringify({ event: 'start', model: 'openai/tts-1', voice: 'alloy' })),],
  ['volcengine-no-auth', ws => ws.send(JSON.stringify({ event: 'start', model: 'volcengine/seed-tts-2.0', voice: 'zh_female_shuangkuaisisi_moon_bigtts' })),],
]

for (const [name, send, expect] of scenarios)
  await runScenario(name, send, expect)
```

This is intentionally a one-shot debug helper, not a CI fixture. If we
want a CI guard, we can move the scenarios into a Go test against an
in-process echo server (with a stub Volcengine ws dialer) and assert
the JSON error events directly — left as a TODO when the protocol
gains more code paths worth regressing against.
