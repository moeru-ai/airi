# 功能说明：火山引擎实时语音集成 + 国产 LLM Provider + 聊天管线修复

本分支为 AIRI 添加了火山引擎端到端实时语音能力、国产大模型 Provider（Dashscope / 火山方舟）、以及若干聊天管线的 bugfix 和 UX 改进。

---

## 一、新增模块

### 1. `packages/volc-realtime/` — 火山引擎二进制协议库

火山引擎实时对话 WSS 接口使用自定义二进制帧协议，此库提供 TypeScript 编解码实现，browser/Node.js 通用。

- **protocol.ts**: 帧编码/解码（MessageType、Flags、4 字节头 + 可选字段 + payload）
- **events.ts**: 事件类型常量（ChatTextQuery=501, ChatResponse=550, ChatEnded=559, TTSResponse=352 等）
- **client.ts**: 协议客户端封装
- **types.ts**: 类型定义

### 2. `services/voice-gateway/` — Node.js WebSocket 中继服务

浏览器无法直接连接火山引擎 WSS（需要服务端签名鉴权），voice-gateway 作为中间层：

- 监听 `ws://localhost:8765`，接收浏览器 WebSocket 连接
- 接收浏览器发送的 PCM 16kHz 音频帧，转发至火山引擎
- 接收火山引擎返回的 ASR 文本、对话回复、TTS 音频，转发回浏览器
- 凭证通过浏览器 WebSocket `config` 消息动态传入（无硬编码默认值）
- 启动前需配置凭证，缺少必要凭证时返回错误而非静默失败

**关键文件**:
- `src/server.ts` — 主服务逻辑 + 会话管理
- `src/env.ts` — 环境变量读取（getter 延迟求值，兼容 ESM）
- `.env.example` — 环境变量模板

### 3. `packages/stage-ui/src/libs/providers/providers/dashscope/` — 通义千问 Provider

为 AIRI 新增 Dashscope (阿里云灵积) LLM Provider：

- 使用 `defineProvider()` 注册，集成到 AIRI 现有 Provider 系统
- 支持模型：qwen3.5-plus, qwen-plus, qwen-max, qwen-turbo, qwen3-235b-a22b
- Base URL 动态获取 `window.location.origin`，自动适配不同 dev server 端口
- 通过 Vite 代理访问（解决 CORS 问题）

### 4. `packages/stage-ui/src/libs/providers/providers/volcengine-ark/` — 火山方舟 Provider

为 AIRI 新增火山方舟 (Doubao) LLM Provider：

- 支持模型：doubao-seed-2.0-pro, doubao-1.5-pro-256k 等
- 同样通过 Vite 代理 + 动态 Base URL

### 5. `packages/stage-ui/src/stores/modules/volc-voice.ts` — 实时语音核心 Store

Pinia store，管理火山实时语音的完整生命周期：

- **连接管理**: WebSocket 连接/断开/重连，状态机 (disconnected → connecting → connected → streaming)
- **音频播放**: PCM 24kHz → 48kHz 线性插值上采样，无间隙 (gapless) 调度播放
- **口型同步**: RMS 能量分析 → 0-1 归一化 → 平滑插值 (attack=0.5, release=0.25) → `useSpeakingStore.mouthOpenSize`
- **ASR 文本**: 实时更新 `asrText`（中间结果）和 `lastFinalAsrText`（最终结果）
- **对话回复**: 流式拼接 `chatResponseText`，`chat_ended` 时触发 hook 写入聊天记录
- **音频输入**: `sendAudioChunk()` 接收外部 PCM 数据

### 6. `packages/stage-ui/src/stores/settings/volc-realtime.ts` — 实时语音设置 Store

持久化设置（localStorage），字段包括：

- `enabled` / `serverUrl` / `autoConnect` — 连接控制
- `volcAppId` / `volcAccessKey` / `volcAppKey` — 必填凭证（无默认值）
- `volcResourceId` / `volcSpeaker` / `volcDialogModel` — 可选参数（有合理默认值）

### 7. `packages/stage-pages/src/pages/settings/providers/realtime-voice/volc-realtime.vue` — 设置 UI

- 凭证输入表单（App ID、Access Key、App Key、Resource ID、Speaker、Dialog Model）
- 连接状态指示器（彩色圆点 + 文字）
- 连接/断开按钮，凭证不完整时禁用并显示警告
- 自动连接开关

---

## 二、现有文件修改

### 聊天管线修复

#### `packages/stage-ui/src/stores/chat.ts`
- `minLiteralEmitLength`: 24 → 4，减少流式输出的缓冲延迟，让文字更快显示

#### `packages/stage-ui/src/stores/llm.ts`
- **修复 `streamText()` 错误不通过 `onEvent` 传递的问题**: `@xsai/stream-text` 内部 IIFE 捕获 fetch 错误后调用 `eventCtrl.error()` 而非 `onEvent()`，导致 `streamFrom()` 的 Promise 永远不 resolve/reject
- 新增 `result.messages.then/catch` 作为兜底，确保流式请求异常时 Promise 正确 reject

#### `packages/stage-layouts/src/components/Widgets/ChatArea.vue`
- **修复流式输出消失**: 移除 catch 块中的 `messages.value.pop()`，该行会错误移除已持久化的用户消息
- **简化麦克风交互**: 移除 Popover 二级菜单（输入设备选择器、音量环），改为单击直接开启/关闭麦克风
- **布局优化**: 麦克风按钮从 textarea 内部绝对定位移到底部独立 div，解决原生 textarea padding 区域捕获点击的问题
- **图标状态修复**: 条件从 `isListening` 改为 `enabled`，麦克风开启后立即显示激活状态
- **火山模式集成**: 当 `volcConnected` 时跳过本地 STT，避免重复处理

### Vite 代理配置

#### `apps/stage-web/vite.config.ts`
- 新增 `/api/volcengine-ark` → `https://ark.cn-beijing.volces.com/api/coding/v3`
- 新增 `/api/dashscope` → `https://coding.dashscope.aliyuncs.com/v1`
- 解决火山方舟和 Dashscope API 不支持浏览器 CORS 的问题

### i18n 国际化

#### `packages/i18n/src/locales/zh-Hans/settings.yaml` & `en/settings.yaml`
- 新增火山实时语音设置页面的所有翻译
- 新增 `credentials-required` 提示文本

### Provider 注册

#### `packages/stage-ui/src/libs/providers/providers/index.ts`
- 注册 Dashscope 和 VolcEngine Ark provider

#### `packages/stage-ui/src/stores/modules/index.ts` & `stores/settings/index.ts`
- 导出 `volc-voice` 和 `volc-realtime` store

---

## 三、架构流程

```text
浏览器 (stage-web)
  │
  ├── 文字聊天模式 ──────────────────────────────────────────┐
  │   ChatArea.vue → chatOrchestrator.performSend()          │
  │   → llm.ts streamFrom() → Dashscope/Ark API (via Vite proxy)
  │   → 流式回复显示在聊天记录                                 │
  │                                                           │
  ├── 实时语音模式 ──────────────────────────────────────────┐ │
  │   index.vue: AudioWorklet 48kHz→16kHz 下采样             │ │
  │   → volcVoice.sendAudioChunk()                           │ │
  │   → WebSocket → voice-gateway (port 8765)                │ │
  │   → 火山引擎 WSS                                         │ │
  │     ├→ ASR: 识别文本 → volcVoice.asrText                 │ │
  │     ├→ Dialog: 对话回复 → chatResponseText               │ │
  │     ├→ TTS: PCM 24kHz → 播放 + 口型同步                  │ │
  │     └→ ChatEnded: 写入 chatSession.sessionMessages       │ │
  │                                                           │ │
  └── 共享基础设施 ─────────────────────────────────────────┘ ┘
      - useSpeakingStore (口型同步)
      - chatSession (聊天记录)
      - settingsAudioDeviceStore (麦克风权限/流)
      - AIRI 现有 Provider 系统
```

---

## 四、部署配置

### 文字聊天 (Dashscope)

1. 设置 → Provider → 灵积 Dashscope → 填写 API Key
2. Base URL 自动使用当前页面 origin（无需手动修改）
3. 设置 → 意识 → 选择 Dashscope provider + 模型

### 实时语音 (火山引擎)

1. 启动 voice-gateway: `pnpm --filter @proj-airi/voice-gateway start`
2. 设置 → 实时语音 → 填写 App ID、Access Key、App Key
3. 点击连接

### 环境要求

- Node.js 23+
- pnpm
- 火山引擎实时对话 API 凭证（实时语音功能）
- Dashscope 或火山方舟 API Key（文字聊天功能）

---

## 五、已知技术要点

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| macOS Chrome 16kHz AudioContext 产生全零音频 | 强制低采样率在某些平台不工作 | 使用系统默认采样率 + AudioWorklet 下采样 |
| 火山方舟/Dashscope CORS 失败 | API 响应头缺少 Authorization 在 Allow-Headers | Vite dev server 代理 |
| `@xsai` baseURL 必须绝对路径 | `new URL(path, baseURL)` 不支持相对路径 | Provider 默认值使用 `window.location.origin` |
| `streamText()` 错误丢失 | 内部 IIFE 的 catch 走 `eventCtrl.error()` 而非 `onEvent()` | 额外监听 `result.messages` Promise |
| HMR 后 WebSocket/AudioContext 丢失 | shallowRef 在 HMR 时不会保留 | 需全页刷新 |
| volc-realtime 包改动后不生效 | exports 指向 dist/ 不是 src/ | 改动后需 `pnpm run build` |
