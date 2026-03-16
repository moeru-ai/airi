---
title: QQ Bot（Koishi + Satori）
description: 参与并贡献 Project AIRI
---

### QQ Bot（Koishi + Satori）

目前 AIRI 的 QQ 接入推荐通过 **Koishi** 作为桥接层，并由 **Satori Protocol** 统一向 AIRI 提供事件与发送消息的 API。

#### 1) 在 Koishi 侧准备 QQ 连接

- 安装并启动 Koishi
- 安装并配置你选择的 QQ 适配器（例如基于 OneBot 的适配器、QQ 官方机器人适配器，或其他 QQ 连接方案）
- 在 Koishi 中启用 `server-satori` 插件，并确保：
  - WebSocket Events 可用（默认路径通常为 `/satori/v1/events`）
  - HTTP API 可用（默认前缀通常为 `/satori/v1`）
  - 如果你开启了鉴权，记录下 Token（后续填入 `SATORI_TOKEN`）

##### QQ 官方机器人：事件推送方式

如果你使用的是 QQ 官方机器人平台，一般会提供两类“消息事件推送”方式（具体以官方文档为准）：

- Webhook/HTTP 回调：由 QQ 平台向你配置的回调地址推送事件
- WebSocket 网关：由你的服务主动连接官方网关接收事件

在本项目中更推荐把“官方推送”的接入细节放在 Koishi/适配器侧处理，然后由 `server-satori` 统一转成 Satori 事件流供 AIRI 消费。

#### 2) 启动 AIRI Satori Bot

```shell
cd services/satori-bot
cp .env .env.local
```

编辑 `.env.local`，重点配置：

```env
# 事件推送 WS：可指向 Koishi 的 server-satori，也可以是你自建的 Satori 网关地址
SATORI_WS_URL=ws://localhost:5140/satori/v1/events
# 发送消息 HTTP API：通常与 WS 同域同前缀
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

#### 3.1) 使用自定义 WS 地址接收推送

如果你的部署环境无法直接使用 Koishi 默认地址（例如需要公网域名、反向代理或跨机部署），可以把 `SATORI_WS_URL` 改成你的自定义 WebSocket 地址，例如：

```env
SATORI_WS_URL=wss://example.com/satori/v1/events
SATORI_API_BASE_URL=https://example.com/satori/v1
```

前提是该 WS/HTTP 端点对外提供的是 **Satori 协议** 的事件与 API（AIRI Satori Bot 会按 Satori 事件格式解析并按 Satori API 发送消息）。

#### 4) 关于“记忆”

`services/satori-bot` 当前作为 AIRI 的独立子模块运行，会将消息与队列数据持久化在本地数据库中（默认目录 `services/satori-bot/data/pglite-db`），用于对话连续性与崩溃恢复；未来会随着 AIRI Core 稳定逐步迁移到统一的核心记忆体系中。
