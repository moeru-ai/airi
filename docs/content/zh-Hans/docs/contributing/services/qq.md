---
title: QQ Bot（Koishi + Satori）
description: 参与并贡献 Project AIRI
---

### QQ Bot（Koishi + Satori）

目前 AIRI 的 QQ 接入推荐通过 **Koishi** 作为桥接层，并由 **Satori Protocol** 统一向 AIRI 提供事件与发送消息的 API。

#### 1) 在 Koishi 侧准备 QQ 连接

- 安装并启动 Koishi
- 安装并配置你选择的 QQ 适配器（例如基于 OneBot 的适配器或其他 QQ 连接方案）
- 在 Koishi 中启用 `server-satori` 插件，并确保：
  - WebSocket Events 可用（默认路径通常为 `/satori/v1/events`）
  - HTTP API 可用（默认前缀通常为 `/satori/v1`）
  - 如果你开启了鉴权，记录下 Token（后续填入 `SATORI_TOKEN`）

#### 2) 启动 AIRI Satori Bot

```shell
cd services/satori-bot
cp .env .env.local
```

编辑 `.env.local`，重点配置：

```env
SATORI_WS_URL=ws://localhost:5140/satori/v1/events
SATORI_API_BASE_URL=http://localhost:5140/satori/v1
SATORI_TOKEN=
```

然后启动：

```shell
pnpm -F @proj-airi/satori-bot dev
```

#### 3) 验证

- 在 QQ 中给已接入的私聊/群聊发送消息
- 观察 `services/satori-bot` 的运行日志是否收到 Satori 事件，并触发回复

#### 4) 关于“记忆”

`services/satori-bot` 当前作为 AIRI 的独立子模块运行，会将消息与队列数据持久化在本地数据库中（默认目录 `services/satori-bot/data/pglite-db`），用于对话连续性与崩溃恢复；未来会随着 AIRI Core 稳定逐步迁移到统一的核心记忆体系中。

