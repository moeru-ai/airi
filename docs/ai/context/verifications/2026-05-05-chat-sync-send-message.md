# Chat Sync v1 — 用户发消息走通 WS sendMessages RPC

- **场景**：登录用户在 stage-web 输入消息 → 客户端经 chat-sync WS RPC 把 user msg + 之后 LLM 回流的 assistant msg 推到 server，本地 meta 上的 `cloudMaxSeq` 单调推进。
- **命令**：
  - `cd .worktrees/feat/chat-sync-client-v1 && VITE_SERVER_URL=https://api.airi.build pnpm -F @proj-airi/stage-web dev`
  - `agent-browser open http://localhost:5174`
  - `agent-browser eval "localStorage.setItem('auth/v1/token', '<JWT>')"` 并刷新
  - `agent-browser fill @e8 "hello from agent-browser" && agent-browser press Enter`
- **预期输出**：
  - Console 出现 `[chat-sync] creating WS client → https://api.airi.build`、`[chat-ws] status → open`、`[chat-sync] reconcile start ...`、`[chat-sync] listChats → N remote chats`
  - REST 三连：`GET /api/v1/chats 200`、`OPTIONS 204`、`POST /api/v1/chats 201`
  - IndexedDB 中登录用户的 session meta 出现 `cloudChatId` 字段，发完消息后 `cloudMaxSeq >= 2`
- **实际输出**（2026-05-05 16:13–16:19 跑了一轮）：
  - 全部 console 转换出现，无 `[chat-sync] listChats failed` 警告
  - `keyval-store` 里 session `zIy9GJxAPtbiDvp3RkQ_E`：
    ```json
    {
      "cloudChatId": "zIy9GJxAPtbiDvp3RkQ_E",
      "cloudMaxSeq": 2,
      "msgCount": 3,
      "userId": "R89bHt3QoCNkNywbYr7lbnpkb75y77MN"
    }
    ```
    user msg + assistant msg 都拿到了 server 返回的 seq，merge 进本地。
  - 同实例的另一条匿名 session `2eEnv8Gn-yCvUURN0kPPy` 保持 `userId: "local"`，没 `cloudChatId`，未上行 —— 路径 7（未登录纯本地）符合预期。
- **环境**：
  - commit SHA: `8a88d233f22ce16fcba6c3a8875d1bef77a4ff06` + 本 worktree 的未 commit 改动
  - server: prod `https://api.airi.build`
  - client: 本地 dev `http://localhost:5174`（Vite 8）
  - stage-ui: VueUse-backed `ws-client`（task #15 之后）
- **最后验证**：2026-05-05

## 已知未覆盖

- 多设备真实 fan-out（A 发，B 收 newMessages）— 需要两个浏览器 / 设备同账号同时在线，本轮只验了发起端的 RPC + meta 推进。
- 重连 race（路径 6）— 没有人为切网测试。
- Server 回声 fix（task #17）— 部署前 prod 还没生效；客户端按 id 去重已经盖住，本轮看不到回声差异。
