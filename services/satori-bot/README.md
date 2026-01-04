# `satori-bot`

通过 Satori 协议让アイリ能够在多个聊天平台（QQ、Telegram、Discord、飞书等）与用户交流。

## 什么是 Satori？

[Satori](https://satori.js.org/) 是一个跨平台聊天机器人协议，由 Koishi 团队开发。它提供了统一的接口来连接多个聊天平台，包括：

- QQ (通过 Chronocat、LLOneBot 等)
- Telegram
- Discord
- 飞书/Lark
- 钉钉
- 微信
- 等等...

通过 Satori 适配器，AIRI 可以同时在多个平台上运行，无需为每个平台单独开发适配器。

## 快速开始

### 1. 克隆项目并安装依赖

```shell
git clone git@github.com:moeru-ai/airi.git
cd airi
pnpm i
```

### 2. 配置环境变量

```shell
cd services/satori-bot
cp .env .env.local
```

编辑 `.env.local` 文件，填入以下配置：

```shell
# Satori 服务端配置
SATORI_WS_URL='ws://localhost:5140/satori/v1/events'
SATORI_API_URL='http://localhost:5140/satori'
SATORI_TOKEN='your-satori-token-here'

# AIRI 服务端配置
AIRI_URL='ws://localhost:6121/ws'
AIRI_TOKEN='abcd'
```

### 3. 启动 Satori 服务端

你需要先启动一个 Satori 服务端（通常是 Koishi）。推荐使用 [Koishi Desktop](https://koishi.chat/zh-CN/manual/starter/desktop.html)：

1. 下载并安装 Koishi Desktop
2. 在 Koishi 中安装你需要的平台适配器（如 `adapter-onebot`、`adapter-telegram` 等）
3. 配置适配器并启动
4. 确保 Satori 服务在 `http://localhost:5140/satori` 运行（Koishi 默认端口 5140，路径 `/satori`）

### 4. 启动 AIRI 服务端

参考 AIRI 主项目文档启动 AIRI 服务端，确保它在 `ws://localhost:6121/ws` 运行。

### 5. 启动 Satori Bot 适配器

```shell
pnpm run -F @proj-airi/satori-bot start
```

## 工作原理

```
聊天平台 (QQ/Telegram/Discord...)
    ↓
Koishi + Satori 协议
    ↓
Satori Bot 适配器 (本项目)
    ↓
AIRI 服务端 (AI 处理)
    ↓
Satori Bot 适配器
    ↓
Koishi + Satori 协议
    ↓
聊天平台
```

1. **接收消息**：用户在聊天平台发送消息 → Koishi 通过 Satori WebSocket 推送事件 → Satori Bot 接收
2. **AI 处理**：Satori Bot 将消息转发给 AIRI 服务端 → AIRI 进行 AI 处理并生成回复
3. **发送回复**：AIRI 返回回复 → Satori Bot 通过 Satori HTTP API 发送 → Koishi 转发到聊天平台

## 配置说明

### Satori 配置

- `SATORI_WS_URL`: Satori WebSocket 事件服务地址（用于接收消息）
- `SATORI_API_URL`: Satori HTTP API 服务地址（用于发送消息）
- `SATORI_TOKEN`: Satori 服务端的访问令牌（在 Koishi 配置中设置）

### AIRI 配置

- `AIRI_URL`: AIRI 服务端的 WebSocket 地址
- `AIRI_TOKEN`: AIRI 服务端的访问令牌

## 相关项目

- [Satori 协议](https://satori.js.org/)
- [Koishi](https://koishi.chat/)
- [Chronocat](https://chronocat.vercel.app/) - QQ 协议实现
- [LLOneBot](https://llonebot.github.io/zh-CN/) - 另一个 QQ 协议实现

## 致谢

- Satori 协议和 Koishi 团队提供的优秀跨平台聊天机器人框架
- AIRI 项目团队
