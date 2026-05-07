# chat-sync v1 review fixes

Code-review-driven hardening pass on `feat/chat-sync-client-v1` covering the P0/P1/P2 findings from a 9-agent multi-reviewer pass plus the two prior codex P1s.

## What changed (review fixes + local-first outbox)

- **ws-client.ts** — pending RPC reject-on-dispose tracker (drains `defineInvoke` closures on socket drop), `wsConnectedEvent` / `wsDisconnectedEvent` no-op listeners removed, reconnect delay floored at 50% of the backoff window (no more sub-50 ms first-retry storms), `disconnect()` no longer kills the status watcher (handle is reusable), new `destroy()` for terminal cleanup, valibot validation on inbound `newMessages` payload (external boundary), unused reconnect config knobs removed (inline constants).
- **cloud-mapper.ts** — valibot validation on 2xx HTTP responses (external boundary), per-request `AbortSignal.timeout` (10 s default), 409-Conflict treated as idempotent claim via list-and-find, `deleteChat` error path deduped with the rest, `applyCreateActions` switched from hand-rolled bounded-concurrency pool to `Promise.all` (v1 workload doesn't justify the pool), `ReconcilePlan` JSDoc moved to the function it documents (interface keeps a description-only block per AGENTS.md).
- **wire-message.ts** — assistant cast removed (discriminated union narrows correctly), incoming wire messages sorted by `seq` before append (out-of-order pagination tolerance), `isCloudSyncableMessage` now rejects `error` role (server validator rejects it; was a latent runtime failure).
- **session-store.ts** — `persistQueue.then(task, task)` replaced with `.then(task)` plus a tail logger so IDB write failures stop being swallowed; reconcile epoch counter invalidates in-flight `reconcileCloudSessions` IIFEs after every `await` once the user swaps; in-memory state (`sessionMetas`, `sessionMessages`, `loadedSessions`, `index`) cleared on user change; tombstones stored in IDB so deleted sessions are not re-adopted on next reconcile; single shared `cloudMapper` instance instead of two; reconcile backfill batched into one `sendMessages` call; `pendingReconcile` flag for rapid reconnect catch-up; `pushMessageToCloud` typed with `MessageRole`; `loadSession` wraps in try/finally so loading-map entries can't wedge; `ensureActiveSessionForCharacter` reentrance-guarded; adopt-branch IDB write uses a snapshot, not a live reference; inline `cloneDeep` swapped for `es-toolkit/cloneDeep`; new JSDoc on every export per AGENTS.md.
- **data-store.ts** — also dedupes its own `cloneDeep` to `es-toolkit/cloneDeep` (alongside change).
- **chat-sessions.repo.ts** — tombstone CRUD (`getTombstones` / `addTombstone` / `removeTombstones`).
- **sessions-drawer.vue** — filters by `(userId.value || 'local')` so anonymous users see their local sessions and post-auth-swap ghosts stay hidden; `extractMessageText` reused for content extraction; `class=""` switched to `:class="[...]"` array form (AGENTS.md style); strings moved to `stage.chat.sessions.*` i18n namespace (en + zh-Hans); per-open generation counter cancels in-flight batch loads when the drawer closes; `SESSIONS_OWNED_BY_REAL_USER` renamed to `ownedSessions`.
- **chat-broadcast.test.ts** — regression test now carries the `commit 88744602f` tracker reference per AGENTS.md.
- **wire-message.test.ts** — updated `isCloudSyncableMessage` cases for the `error` change; added an out-of-seq-order regression test.
- **cloud-mapper.test.ts** — new mock-fetch tests for `listChats` (happy path, schema drift on 2xx, JSON / non-JSON error bodies), `createChat` (happy path, 409-as-claim, 409-without-id), `deleteChat` (id encoding, 5xx handling), and `applyCreateActions` (success, partial failure, empty input).
- **ws-client.test.ts** — new tests for `buildChatWsUrl`, `computeReconnectDelay` floor + ceiling, `mapStatus` 4-state translation.
- **chat.contract.test.ts** — mock store extended with `pushMessageToCloud` (was missing after the original chat-sync feature landed).

### Local-first outbox

Earlier review left a structural gap: `pushMessageToCloud` was best-effort fire-and-forget; a successful WS open + a 5xx server (or transient socket flap mid-write) **dropped the message to server permanently** because `pullMessages` could only fetch what the server had, and reconcile's create-branch backfill only ran for newly-minted cloudChatIds. Same shape for offline `deleteSession` — tombstone blocked re-adoption but cloud DELETE never retried.

- **chat-sessions.repo.ts** — new `getOutbox` / `enqueueOutbox` / `dequeueOutbox` / `updateOutboxEntries` / `dropOutboxForSession` keyed at `local:chat/outbox/<userId>`; idempotent on `messageId` so an online/offline flap can't duplicate rows. Existing tombstone helpers stay; `clear(userId)` now also drops the outbox key.
- **session-store.ts**:
  - `pushMessageToCloud` now ALWAYS persists to the IDB outbox first (await), then attempts opportunistic WS dispatch. A success dequeues; a failure leaves the entry to be drained later.
  - New `drainOutbox()` (single-flight): groups outbox by sessionId, sorts by `queuedAt`, batches one `sendMessages` per session. Skip sessions without `cloudChatId` (they wait for the next reconcile). Bumps `attempts` on failure; entries hitting `OUTBOX_MAX_ATTEMPTS = 5` stay in the outbox so the user can see them via `outboxPendingCount`.
  - New `drainTombstones()`: retries `mapper.deleteChat` for every pending tombstone; treats HTTP 404 as success (server already cleared it). Drops the tombstone on success.
  - `reconcileCloudSessions` final phase: `Promise.all([drainOutbox(), drainTombstones()])` after the catch-up pull. WS-open → reconcile already covers the reconnect case.
  - `reconcileCloudSessions` create branch: replaced the inline `wsClient.sendMessages` backfill with outbox enqueue. The trailing `drainOutbox` now handles backfill uniformly with normal sends.
  - `deleteSession`: also calls `dropOutboxForSession` so messages bound for the just-deleted chat don't keep retrying against a 404.
  - New reactive ref `outboxPendingCount` exposed via the store return; surfaces the IDB outbox length so a UI banner can render "X messages syncing".

### Why not stream-kit

`packages/stream-kit/createQueue` is a fine in-memory queue (single-flight drain, events, per-item handlers) and is reused by `chat.ts` for the chat send pipeline. For the outbox specifically the persistence layer IS the feature — the queue must survive reload and tab close — so a direct IDB-first implementation is simpler than layering stream-kit on top of IDB. stream-kit stays the right tool for in-memory pipelines (chat orchestration, queue-style UI flows).

## Verifications

### 场景 1: stage-ui typecheck

- **场景**: 用户敲 `pnpm -F @proj-airi/stage-ui typecheck` → 预期所有触及的 chat-sync 文件 + drawer + session-store 通过 vue-tsc
- **命令**: `pnpm -F @proj-airi/stage-ui typecheck`
- **预期输出**: exit 0, no errors
- **实际输出**: `> vue-tsc --noEmit` clean exit
- **环境**: HEAD `2858ee93c` + uncommitted changes; node 24, pnpm 10
- **最后验证**: 2026-05-06

### 场景 2: server typecheck

- **场景**: 用户敲 `pnpm -F @proj-airi/server typecheck` → 预期 chat-broadcast 测试更新通过
- **命令**: `pnpm -F @proj-airi/server typecheck`
- **预期输出**: exit 0
- **实际输出**: `> tsc --noEmit` clean exit
- **环境**: 同上
- **最后验证**: 2026-05-06

### 场景 3: stage-tamagotchi + stage-web typecheck

- **场景**: 消费 stage-ui 的两个 app 不被破坏接口变更影响（特别是 `pushMessageToCloud` 类型收紧、`createCloudChatMapper` 选项变更）
- **命令**: `pnpm -F @proj-airi/stage-tamagotchi typecheck && pnpm -F @proj-airi/stage-web typecheck`
- **预期输出**: 两个都 exit 0
- **实际输出**: 都 clean exit
- **环境**: 同上
- **最后验证**: 2026-05-06

### 场景 4: chat-sync 全部测试通过

- **场景**: 用户跑 `pnpm exec vitest run packages/stage-ui/src/libs/chat-sync/` → 预期新增的 schema 验证、409 idempotency、worker pool 替换、out-of-seq sort 等回归测试都过
- **命令**: `pnpm exec vitest run packages/stage-ui/src/libs/chat-sync/ packages/stage-ui/src/stores/chat.contract.test.ts apps/server/src/utils/tests/chat-broadcast.test.ts`
- **预期输出**: `Test Files  X passed (X)`, no failures
- **实际输出**: `Test Files  5 passed (5) / Tests  51 passed (51)`
- **环境**: 同上
- **最后验证**: 2026-05-06

### 场景 5: 触及范围 lint clean

- **场景**: 用户跑 `pnpm exec eslint <touched-files>` → 预期 0 errors / 0 warnings
- **命令**: `pnpm exec eslint packages/stage-ui/src/libs/chat-sync packages/stage-ui/src/stores/chat/ packages/stage-ui/src/components/scenarios/chat/components/sessions-drawer.vue packages/stage-ui/src/database/repos/chat-sessions.repo.ts apps/server/src/utils/tests/chat-broadcast.test.ts apps/server/src/utils/chat-broadcast.ts apps/server/src/routes/chat-ws/index.ts`
- **预期输出**: 无输出（exit 0）
- **实际输出**: 无输出
- **环境**: 同上；仓库其余位置（services/computer-use-mcp, services/minecraft, services/twitter-services）的 pre-existing 警告未触及
- **最后验证**: 2026-05-06

## Browser-tested user paths (agent-browser, stage-web @ localhost:5173 → prod api)

### 场景 6: anonymous drawer visibility

- **场景**: 未签到打开 app → drawer 显示本地会话（旧 filter `userId !== 'local'` 会让 drawer 空显）
- **命令**: `agent-browser open http://localhost:5173 → press Escape → click "Conversations"`
- **预期输出**: drawer 列出 1 行 "New chat / now"，无 CLOUD badge
- **实际输出**: 见 `/tmp/airi-anon-drawer.png` —— "New chat / now" 单行
- **环境**: stage-web dev `localhost:5173`，无 token，prod api
- **最后验证**: 2026-05-06

### 场景 7: signed-in drawer + ghost-cleanup

- **场景**: 注入 OIDC token (Rainbow Bird) + reload → drawer 应只显示该账号的 cloud sessions，不应残留匿名 era 的 "New chat"
- **命令**: `localStorage.setItem('auth/v1/token', <bearer>) → location.reload() → click "Conversations"`
- **预期输出**: drawer 列出 N 个 CLOUD badge 的会话，0 个匿名 "New chat"
- **实际输出**: 见 `/tmp/airi-signedin-drawer.png` —— "fanout-test from device A / now / CLOUD"、"New chat / 24 hours ago / CLOUD"、"New chat / yesterday / CLOUD"，0 ghost
- **环境**: 同上，token issuer 为 `https://api.airi.build/api/auth`
- **最后验证**: 2026-05-06

### 场景 8: i18n drawer 渲染

- **场景**: drawer header / "+ New" / "now" / "yesterday" / "24 hours ago" / cloud badge 都从 `stage.chat.sessions.*` 读，不是硬编码
- **命令**: 与场景 7 同
- **预期输出**: 文案与 `packages/i18n/src/locales/en/stage.yaml` 的 `chat.sessions.*` 对齐
- **实际输出**: drawer 渲染 "Conversations" / "+ New" / "CLOUD" 完全对齐 yaml；时间标签来自 `Intl.RelativeTimeFormat`
- **环境**: 同上
- **最后验证**: 2026-05-06

### 场景 9: outbox happy path（在线 send）

- **场景**: 签到态发送消息 → `pushMessageToCloud` 走 outbox enqueue → 立即 WS dispatch → 成功后 dequeue → drawer 反映新 session 的 cloudChatId 绑定
- **命令**: `fill textbox "outbox test message" → press Enter → wait → click "Conversations"`
- **预期输出**:
  1. console 无 `[chat-sync] persist task failed` / `sendMessages failed` 错误
  2. drawer 顶部出现新 session "outbox test message / now / CLOUD"
  3. `[chat-sync] reconcile start` + `listChats → 4 remote chats`（之前 3）
- **实际输出**: 见 `/tmp/airi-after-send-drawer.png`、`/tmp/airi-after-send.png` —— 新 session 带 CLOUD badge 出现在第一行；console 无错误；reconcile 触发并拿到 4 chat
- **环境**: 同上
- **最后验证**: 2026-05-06

## chrome-devtools-mcp 网络模拟实测（local-first outbox / tombstone retry）

### 场景 10: 离线 send → 重连 drain

- **场景**: `emulate networkConditions=Offline` → 输入两条消息按 Enter → 验证 IDB outbox 累积 → 关闭 emulation → 等待 reconcile → 验证 outbox 清空
- **命令**: `mcp__chrome-devtools-mcp__emulate networkConditions=Offline → fill + dispatchEvent Enter ×2 → emulate (clear) → sleep 6s → evaluate IDB`
- **预期输出**:
  1. 离线发送后 IDB `airi-local:chat:outbox:<userId>` = 2 entries（"offline message A" / "offline message B"，attempts: 0）
  2. 重连 6 秒后 outbox = 0 entries
- **实际输出**:
  ```json
  {"count": 2, "contents": [
    {"id": "tkGYiX", "content": "offline message A", "attempts": 0},
    {"id": "-p082M", "content": "offline message B", "attempts": 0}
  ]}
  // emulate offline cleared + 6s wait
  {"count": 0, "contents": []}
  ```
- **环境**: stage-web `localhost:5173`，token 1h fresh，prod api
- **最后验证**: 2026-05-06

### 场景 11: Tab close 中途 send → 重开 drain（IDB 持久化证明）

- **场景**: 离线发送 "survives reload" → 验证 IDB 有 entry → reload page → 验证 IDB 还在 → 重连后 outbox 清空 + 消息出现在聊天历史
- **命令**: `emulate Offline → fill + send "survives reload" → evaluate IDB outbox=1 → emulate clear → reload → wait Rainbow Bird → evaluate IDB outbox=0`
- **预期输出**:
  1. 离线 send 后 outbox = 1 entry("survives reload")
  2. reload 后 chat history 仍包含 "survives reload" 文本
  3. reload + reconcile 后 outbox = 0
- **实际输出**:
  - reload 后 page snapshot 显示 chat 区出现 "You / survives reload"（IDB 的 sessionMessages 持久化 ✓）
  - reload + 6s 后 IDB outbox = 0（drain 成功）
- **环境**: 同上
- **最后验证**: 2026-05-06

### 场景 12: 离线 delete → 重连 tombstone DELETE 重试

- **场景**: 删除一个 cloud-mapped session（offline）→ 验证 tombstone 写入 IDB 且 session 从 index 消失 → reconnect → 验证 tombstone 被清空（drainTombstones 重试 DELETE 成功 / 404）+ session NOT 重新被 adopt
- **命令**: `emulate Offline → click drawer delete row → evaluate IDB → emulate clear → reload → evaluate IDB`
- **预期输出**:
  1. 离线 delete 后：sessionCount 5→4，tombstones=[NCmnYWV...]，session 不在 index
  2. reconnect (reload) 后：tombstones=[]，sessionCount=4，NCmnY 未重新 adopt
- **实际输出**:
  ```json
  // pre: { tombstones: [], sessionCount: 5 }
  // offline delete: { tombstones: ["NCmnYWV-SpHMRiYeWzjxK"], sessionCount: 4, hasNCmnY: false }
  // reconnect + reload + 6s: { tombstones: [], sessionCount: 4, NCmnYReAdopted: false }
  ```
- **附注**: 不 reload 直接 emulate clear 后等 14+ 秒，tombstone 仍未清——因为 WS 在长离线窗口里已经走到 `[exp/2, exp)` 的高端 backoff，要么等更久要么 reload 主动重连。生产环境用户切回 tab 时通常会触发 navigation event；如果停在原 tab 上 idle，重连会按 backoff 完成。这个 trade-off 写在代码注释里。
- **环境**: 同上
- **最后验证**: 2026-05-06

### 场景 13: WS RPC mid-flight 断 → reject（pending-tracker 单元测试）

浏览器里造场景需要 server 慢响应，chrome-devtools-mcp 不够直接。**改为单元层验证**：把 ws-client.ts 内的 `trackPending` + `pendingRpcRejects` Set 抽出到 `pending-tracker.ts`（有 JSDoc / NOTICE），写 7 个 vitest 用例覆盖：

- 通过 underlying promise 的 resolve / reject ✓
- in-flight promise 在 `drainAll(error)` 后 reject 同一 error，underlying 后续 settle 不影响（R-01 / JFR-001 P0 contract）✓
- 多个 in-flight 一起 drainAll ✓
- 空 tracker drainAll 安全 no-op ✓
- drainAll 后 tracker 复用 ✓
- drainAll 后 underlying 再 reject 不重入（避免 unhandled rejection）✓

测试结果：`pending-tracker.test.ts` 7/7 pass。源码集成进 `ws-client.ts` 的 `disposeContext`：

```ts
const pendingRpcs = createPendingTracker()
// ... in disposeContext:
pendingRpcs.drainAll(new Error('chat-ws: rpc cancelled (socket disconnected)'))
// ... in return shape:
sendMessages: req => pendingRpcs.track(invokeSendMessages(req)),
pullMessages: req => pendingRpcs.track(invokePullMessages(req)),
```

- **环境**: vitest @ stage-ui，无 IDB 依赖
- **最后验证**: 2026-05-06

## 仍未覆盖（次要）

- **token 过期 + 长离线 + reconnect**：要等 1h 或手动 invalidate，会话级别可推迟到 release smoke。`authedFetch` 401 → refresh → retry 路径已有现成机制（pre-existing on main），chat-sync v1 没改。


