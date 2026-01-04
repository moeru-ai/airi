# AIRI Satori Bot

一个基于 Satori 协议的 AI 聊天机器人，可以通过 Koishi 连接到多个聊天平台（QQ、Telegram、Discord、飞书等）。

## 架构说明

本项目采用**独立架构**，参考了 Telegram Bot 的实现模式

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
# 在 services/satori-bot 目录
cp .env .env.local
```

编辑 `.env.local`：

```env
# Satori Configuration
SATORI_WS_URL=ws://localhost:5140/satori/v1/events
SATORI_API_BASE_URL=http://localhost:5140/satori/v1
SATORI_TOKEN=your_satori_token_here

# LLM Configuration
LLM_API_KEY=your_api_key_here
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4
LLM_RESPONSE_LANGUAGE=简体中文
LLM_OLLAMA_DISABLE_THINK=false
```

### 配置说明

#### Satori 配置

- `SATORI_WS_URL`: Satori WebSocket 地址（Koishi 默认：`ws://localhost:5140/satori/v1/events`）
- `SATORI_API_BASE_URL`: Satori HTTP API 地址（Koishi 默认：`http://localhost:5140/satori/v1`）
- `SATORI_TOKEN`: Satori 认证令牌（在 Koishi 配置中获取，如果为空 请留空，如：`SATORI_TOKEN=`）

**重要**: Koishi 的 Satori 服务默认路由是 `/satori/v1`，因此完整的 API 路径会自动拼接，例如：
- 发送消息: `http://localhost:5140/satori/v1/message.create`
- 获取消息: `http://localhost:5140/satori/v1/message.get`

#### LLM 配置

- `LLM_API_KEY`: LLM API 密钥
- `LLM_API_BASE_URL`: LLM API 地址
- `LLM_MODEL`: 使用的模型名称
- `LLM_RESPONSE_LANGUAGE`: 回复语言（默认：简体中文）
- `LLM_OLLAMA_DISABLE_THINK`: 是否禁用 Ollama 的思考模式

## 使用

### 开发模式

```bash
# 在项目根目录
pnpm --filter @proj-airi/satori-bot dev
```

### 生产模式

```bash
# 在项目根目录
pnpm --filter @proj-airi/satori-bot start
```

### 类型检查

```bash
# 在项目根目录
pnpm --filter @proj-airi/satori-bot typecheck
```

## 常见问题

### 1. 如何配置 Koishi？

在 Koishi 中启用 `server-satori`，配置项保持默认即可，无需改动。

### 2. 如何自定义 AI 人格？

可以编辑以下文件：

- `services\satori-bot\src\prompts\personality-v1.velin.md`
- `services\satori-bot\src\prompts\system-action-gen-v1.velin.md`

### 3. 数据库文件在哪里？

`services/satori-bot/data/db.json`

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 相关链接

- [AIRI 项目](https://github.com/moeru-ai/airi)
- [Satori 协议文档](https://satori.chat/)
- [Koishi 文档](https://koishi.chat/)
