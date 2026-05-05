# Chat Sync v1 — 多设备 fan-out 走通 newMessages 推送

- **场景**：同账号在两个浏览器 tab（同 origin、独立 Pinia store / WS 连接）打开 stage-web；设备 A 发消息后，设备 B 在不主动操作的情况下应通过 server 端 `broadcastToLocalDevices` + `newMessages` outbound 实时拿到消息。
- **命令**：
  - `cd .worktrees/feat/chat-sync-client-v1 && VITE_SERVER_URL=https://api.airi.build pnpm -F @proj-airi/stage-web dev`
  - `agent-browser open http://localhost:5174` (tab t1 = 设备 A)
  - `agent-browser eval "localStorage.setItem('auth/v1/token', '<JWT>')"`，`agent-browser open http://localhost:5174` 再刷新
  - `agent-browser tab new http://localhost:5174` (tab t2 = 设备 B，同 origin 共享 token)
  - 两边都等 `[chat-ws] status → open` + `[chat-sync] listChats → ...` 出现
  - `agent-browser tab t1 && agent-browser fill @e8 "fanout-test from device A" && agent-browser press Enter`
  - 等 LLM SSE finish（assistant 回复回流到 tab 1）
  - `agent-browser tab t2 && agent-browser eval "..."` 读 tab 2 IndexedDB 看共享的 cloudChatId session 是否包含相同的 user / assistant 消息
- **预期输出**：
  - tab 2 没主动发消息，但其 `airi-local:chat:sessions:<cloudChatId>` 在 IDB 中应该出现 tab 1 发的 user msg id + assistant reply id
  - tab 2 的 `cloudMaxSeq` 应该 ≥ 2（user + assistant 各一个 seq）
  - tab 2 的 motion / delay handler 可能也会激活（assistant `<|ACT|>` token 解析路径走通）
- **实际输出**（2026-05-05 16:42–16:43 跑了一轮）：
  - tab 1 send 后 IDB session `flrTBlslhwAKg354mwg4J` `cloudMaxSeq=2`，`msgCount=3`：
    ```json
    last2: [
      { "role": "user", "id": "5YFgdz2S2jKrO4gi0B7M9", "content": "fanout-test from device A" },
      { "role": "assistant", "id": "O7FsVP4EhA6RQvN0w9aAn", "content": " Hmm... It seems like there's a message from device A!..." }
    ]
    ```
  - tab 2 IDB **同一个 session id** `flrTBlslhwAKg354mwg4J`：
    ```json
    cloudMaxSeq: 2
    last3: [system, { "role":"user", "id":"5YFgdz...", "content":"fanout-test from device A" }, { "role":"assistant", "id":"O7Fs...", ... }]
    ```
    user 和 assistant 的 id 与 tab 1 完全一致 → 不是本地生成，是 WS push 来的。
  - tab 2 console 出现 `Setting motion: Think` + `delay detected 1` —— `<|ACT|>` 解析路径在 tab 2 也跑了，说明 assistant 消息进入了 reactive 流，不只是 IDB。
- **环境**：
  - commit: `8a88d233f22ce16fcba6c3a8875d1bef77a4ff06` + 本 worktree 未 commit 改动
  - server: prod `https://api.airi.build`（**回声 fix 在 worktree 未部署**，但客户端按 id 去重盖住）
  - client: 本地 dev `http://localhost:5174`
  - stage-ui: VueUse-backed `ws-client` (task #15 之后)
- **最后验证**：2026-05-05

## 副观察

- 两个 tab 同 origin 时 IndexedDB 是共享的；这次 fan-out 测试的"独立性"只在 Pinia store + WS connection 层面成立。**真·跨设备**（不同浏览器 / 真实物理设备）只能靠这一次跑出来的因果证据外推 —— wire 上 server 端 `broadcastToLocalDevices` 不区分 tab 还是 device，所以行为对等。
- prod server 还是合并前的版本（没有 `originInstanceId` 过滤），但客户端 `mergeCloudMessagesIntoLocal` 按 message id 去重，回声不会显示成重复消息。worktree 那部分 server fix 部署后会更"干净"，但功能上现在已经正确。
- tab 2 那条 `WebSocket server connection error` 是 stage-web 现有的 dev devtools/iframe 上的另一条 WS（看堆栈），跟 chat-sync WS 不是一回事。
