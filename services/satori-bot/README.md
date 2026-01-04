# AIRI Satori Bot

一个基于 Satori 协议的 AI 聊天机器人，可以通过 Koishi 连接到多个聊天平台（QQ、Telegram、Discord、飞书等）。

## 架构说明

本项目采用**独立架构**，参考了 Telegram Bot 的实现模式：

- ✅ 直接调用 LLM API（`@xsai/generate-text`）
- ✅ 有自己的 prompt 系统
- ✅ 使用轻量级数据库（lowdb - JSON 数据库）
- ✅ 完全独立运行，不依赖 AIRI Server Runtime
- ✅ 消息流程：Satori → LLM → Satori

## 功能特性

- 🤖 智能对话：基于 LLM 的自然语言理解和生成
- 🔌 多平台支持：通过 Satori 协议连接多个聊天平台
- 💾 消息历史：自动记录频道和消息历史
- 🎯 上下文管理：智能管理对话上下文
- 🔄 自动重连：WebSocket 断线自动重连
- 📊 消息队列：异步处理消息，避免阻塞

## 前置要求

1. **Koishi 实例**：需要一个运行中的 Koishi 实例，并启用 Satori 服务
2. **LLM API**：OpenAI API 或兼容的 API（如 Ollama、vLLM 等）
3. **Node.js**: >= 18.0.0
4. **pnpm**: >= 8.0.0

## 安装

```bash
# 在项目根目录
pnpm install
```

## 配置

复制 `.env` 文件并修改配置：

```bash
cp .env .env.local
```

编辑 `.env.local`：

```env
# Satori 配置
SATORI_WS_URL=ws://localhost:5140/satori/v1/events
SATORI_API_BASE_URL=http://localhost:5140
SATORI_TOKEN=your_satori_token_here

# LLM 配置
LLM_API_KEY=your_api_key_here
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4
LLM_RESPONSE_LANGUAGE=简体中文
LLM_OLLAMA_DISABLE_THINK=false
```

### 配置说明

#### Satori 配置

- `SATORI_WS_URL`: Satori WebSocket 地址（默认：`ws://localhost:5140/satori/v1/events`）
- `SATORI_API_BASE_URL`: Satori HTTP API 地址（默认：`http://localhost:5140`）
- `SATORI_TOKEN`: Satori 认证令牌（在 Koishi 配置中获取）

#### LLM 配置

- `LLM_API_KEY`: LLM API 密钥
- `LLM_API_BASE_URL`: LLM API 地址
- `LLM_MODEL`: 使用的模型名称
- `LLM_RESPONSE_LANGUAGE`: 回复语言（默认：简体中文）
- `LLM_OLLAMA_DISABLE_THINK`: 是否禁用 Ollama 的思考模式

## 使用

### 开发模式

```bash
pnpm --filter @proj-airi/satori-bot dev
```

### 生产模式

```bash
pnpm --filter @proj-airi/satori-bot start
```

### 类型检查

```bash
pnpm --filter @proj-airi/satori-bot typecheck
```

## 工作原理

### 消息处理流程

```
Satori 消息 → WebSocket 客户端 →
→ 消息队列 →
→ imagineAnAction (调用 LLM) →
→ dispatchAction (执行 action) →
→ sendMessage →
→ 发送回 Satori
```

### 可用 Actions

1. **list_channels** - 列出所有可用频道
2. **send_message** - 发送消息到指定频道
3. **read_unread_messages** - 读取未读消息
4. **continue** - 继续当前任务
5. **break** - 清空记忆并休息
6. **sleep** - 休眠一段时间

### 数据存储

使用 lowdb（JSON 数据库）存储：
- 频道信息
- 消息历史（最多 1000 条）

数据文件位置：`services/satori-bot/data/db.json`

## 项目结构

```
services/satori-bot/
├── src/
│   ├── actions/           # Action 处理模块
│   │   ├── send-message.ts
│   │   └── read-unread-messages.ts
│   ├── bot/              # Bot 核心逻辑
│   │   └── index.ts
│   ├── client/           # Satori 客户端
│   │   ├── satori-client.ts
│   │   └── satori-api.ts
│   ├── db/               # 数据库模块
│   │   └── index.ts
│   ├── llm/              # LLM 处理
│   │   └── actions.ts
│   ├── prompts/          # Prompt 模板
│   │   └── index.ts
│   ├── types/            # 类型定义
│   │   ├── bot.ts
│   │   └── satori.ts
│   ├── utils/            # 工具函数
│   │   └── promise.ts
│   └── index.ts          # 主入口
├── data/                 # 数据目录
│   └── db.json
├── .env                  # 环境变量模板
├── .env.local            # 本地环境变量（不提交）
├── package.json
├── tsconfig.json
└── README.md
```

## 与 Discord Bot 的区别

**Discord Bot（旧架构，不推荐）**：
- ❌ 依赖 AIRI Server Runtime
- ❌ 发送 `input:text` 事件，但没有组件处理
- ❌ 等待 `output:gen-ai:chat:complete`，但永远不会触发
- ❌ 缺少 AI Core 模块

**Satori Bot（新架构，推荐）**：
- ✅ 完全独立运行
- ✅ 直接调用 LLM API
- ✅ 不依赖 AIRI Server Runtime
- ✅ 可立即工作

## 常见问题

### 1. 如何配置 Koishi？

在 Koishi 中安装并启用 `@koishijs/plugin-server` 和 `@koishijs/plugin-adapter-satori`。

### 2. 支持哪些 LLM？

支持所有兼容 OpenAI API 的 LLM：
- OpenAI GPT-4/GPT-3.5
- Anthropic Claude（通过代理）
- Ollama 本地模型
- vLLM 部署的模型
- 其他兼容 API

### 3. 如何自定义 AI 人格？

编辑 [`src/prompts/index.ts`](src/prompts/index.ts:1) 中的 `personality()` 函数。

### 4. 数据库文件在哪里？

`services/satori-bot/data/db.json`

### 5. 如何调试？

查看控制台日志，日志级别为 Debug，会显示详细的消息处理流程。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 相关链接

- [AIRI 项目](https://github.com/moeru-ai/airi)
- [Satori 协议文档](https://satori.js.org/)
- [Koishi 文档](https://koishi.chat/)
