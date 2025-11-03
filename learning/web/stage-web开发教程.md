# AIRI Stage-Web 开发教程

> 本教程将帮助你从零开始理解和开发 AIRI 项目的 Web 版本（stage-web）

## 目录

1. [项目概览](#1-项目概览)
2. [技术栈解析](#2-技术栈解析)
3. [项目结构详解](#3-项目结构详解)
4. [核心概念](#4-核心概念)
5. [开发环境搭建](#5-开发环境搭建)
6. [核心模块深入](#6-核心模块深入)
7. [实战开发指南](#7-实战开发指南)
8. [调试技巧](#8-调试技巧)
9. [常见问题](#9-常见问题)

---

## 1. 项目概览

### 1.1 什么是 stage-web？

`stage-web` 是 AIRI 项目的浏览器版本，它是一个基于 Vue 3 的单页应用（SPA），提供了完整的 AI 虚拟角色交互体验，包括：

- **视觉展示**：支持 Live2D 和 VRM 3D 模型渲染
- **语音交互**：集成语音识别（STT）和语音合成（TTS）
- **对话系统**：支持多种 LLM 提供商（OpenAI、Claude 等）
- **记忆系统**：基于 DuckDB WASM 的浏览器内数据库
- **跨平台**：支持 PWA，可安装到桌面和移动设备

### 1.2 核心特性

```
┌─────────────────────────────────────────────────┐
│                  stage-web                      │
├─────────────────────────────────────────────────┤
│  视觉层 (Visual)                                │
│  ├─ Live2D 渲染 (基于 pixi-live2d-display)     │
│  └─ VRM 渲染 (基于 @pixiv/three-vrm)           │
├─────────────────────────────────────────────────┤
│  交互层 (Interaction)                           │
│  ├─ 聊天界面 (ChatHistory)                     │
│  ├─ 语音输入 (VAD + Whisper)                   │
│  └─ 设置面板 (Settings)                        │
├─────────────────────────────────────────────────┤
│  逻辑层 (Logic)                                 │
│  ├─ 状态管理 (Pinia Stores)                    │
│  ├─ LLM 集成 (xsai 生态)                       │
│  └─ 音频处理 (Web Audio API)                   │
├─────────────────────────────────────────────────┤
│  数据层 (Data)                                  │
│  ├─ DuckDB WASM (记忆存储)                     │
│  ├─ IndexedDB (模型文件)                       │
│  └─ LocalStorage (配置)                        │
└─────────────────────────────────────────────────┘
```

---

## 2. 技术栈解析

### 2.1 核心框架

| 技术 | 版本 | 用途 |
|------|------|------|
| **Vue 3** | ^3.5.22 | 响应式 UI 框架 |
| **Vite** | catalog:rolldown-vite | 构建工具和开发服务器 |
| **TypeScript** | ~5.9.3 | 类型安全 |
| **Pinia** | ^3.0.3 | 状态管理 |
| **Vue Router** | ^4.5.1 | 路由管理 |

### 2.2 UI 和样式

| 技术 | 用途 |
|------|------|
| **UnoCSS** | 原子化 CSS 框架（类似 Tailwind） |
| **Reka UI** | 无头组件库 |
| **TresJS** | Vue 的 Three.js 集成 |
| **FormKit Auto-animate** | 声明式动画 |
| **VueUse Motion** | 动画库 |

### 2.3 AI 和音频

| 技术 | 用途 |
|------|------|
| **@xsai/*** | 统一的 LLM 接口（支持 OpenAI、Claude 等） |
| **@huggingface/transformers** | 浏览器内 ML 模型（Whisper STT） |
| **@ricky0123/vad-web** | 语音活动检测 |
| **unspeech** | 语音合成 |
| **onnxruntime-web** | ONNX 模型运行时 |

### 2.4 3D 和渲染

| 技术 | 用途 |
|------|------|
| **pixi-live2d-display** | Live2D Cubism 4 渲染 |
| **Three.js** | 3D 渲染引擎 |
| **@pixiv/three-vrm** | VRM 模型加载和动画 |

---

## 3. 项目结构详解

### 3.1 目录结构

```
apps/stage-web/
├── src/
│   ├── components/          # 组件目录
│   │   ├── Backgrounds/     # 背景效果组件
│   │   ├── DataGui/         # 数据控制组件
│   │   ├── Layouts/         # 布局组件
│   │   └── Widgets/         # 功能小部件
│   ├── composables/         # 组合式函数
│   ├── layouts/             # 页面布局
│   ├── pages/               # 路由页面
│   ├── stores/              # Pinia 状态管理
│   ├── styles/              # 全局样式
│   ├── utils/               # 工具函数
│   ├── workers/             # Web Workers
│   ├── App.vue              # 根组件
│   └── main.ts              # 入口文件
├── index.html               # HTML 模板
├── package.json             # 依赖配置
├── vite.config.ts           # Vite 配置
└── uno.config.ts            # UnoCSS 配置
```

### 3.2 关键文件说明

#### `main.ts` - 应用入口

```typescript
// 主要功能：
// 1. 初始化 Vue 应用
// 2. 注册插件（Pinia、Router、i18n、Tres 等）
// 3. 设置路由守卫
// 4. 挂载应用
```

#### `App.vue` - 根组件

```typescript
// 主要功能：
// 1. 管理全局主题（亮/暗模式、动态色相）
// 2. 管理首次设置向导（OnboardingDialog）
// 3. 管理全局通知（Toaster）
// 4. 管理页面转场动画（StageTransitionGroup）
```

#### `vite.config.ts` - 构建配置

```typescript
// 主要功能：
// 1. 配置路径别名（指向 monorepo 内部包）
// 2. 配置插件（Vue、i18n、PWA 等）
// 3. 配置资源下载（Live2D SDK、模型文件）
// 4. 配置 HuggingFace Space 部署选项
```

---

## 4. 核心概念

### 4.1 Monorepo 架构

stage-web 是 AIRI monorepo 的一部分，它依赖多个内部包：

```
stage-web 依赖树：
├── @proj-airi/stage-ui       # 核心 UI 组件（Live2D、VRM、聊天等）
├── @proj-airi/stage-pages    # 共享页面组件
├── @proj-airi/stage-shared   # 共享工具函数
├── @proj-airi/audio          # 音频处理工具
├── @proj-airi/i18n           # 国际化
├── @proj-airi/ccc            # 角色卡片系统
└── @proj-airi/server-sdk     # 服务端 SDK
```

**重要提示**：修改这些内部包会实时影响 stage-web，因为 Vite 配置了别名指向源码目录。

### 4.2 状态管理架构

使用 Pinia 作为状态管理，主要的 stores 有：

| Store | 位置 | 用途 |
|-------|------|------|
| `useSettings` | `@proj-airi/stage-ui` | 全局设置（语言、主题、模型选择） |
| `useChatStore` | `@proj-airi/stage-ui` | 聊天历史和消息流 |
| `useLive2d` | `@proj-airi/stage-ui` | Live2D 模型状态 |
| `useDisplayModelsStore` | `@proj-airi/stage-ui` | 模型文件管理 |
| `useProvidersStore` | `@proj-airi/stage-ui` | LLM 提供商配置 |
| `usePWAStore` | `stage-web/stores` | PWA 更新管理 |

### 4.3 路由和布局

使用 `unplugin-vue-router` 基于文件系统自动生成路由：

```
src/pages/
├── index.vue                    # 路由: /
│   └── meta.layout: stage       # 使用 stage 布局
├── devtools/
│   ├── audio-record.vue         # 路由: /devtools/audio-record
│   └── ...                      # 其他开发工具页面
└── settings/
    └── system/
        └── index.vue            # 路由: /settings/system
```

**布局系统**：

- `stage.vue`：舞台页面布局（主页）
- `settings.vue`：设置页面布局
- `home.vue`：通用内容页面布局
- `default.vue`：默认布局
- `plain.vue`：纯净布局（无额外装饰）

### 4.4 组件通信模式

1. **Props Down, Events Up**（父子组件）
2. **Provide/Inject**（跨层级组件）
3. **Pinia Store**（全局状态）
4. **Event Bus**（使用 `@unbird/eventa`）
5. **BroadcastChannel API**（跨标签页通信）

---

## 5. 开发环境搭建

### 5.1 前置要求

```bash
# 检查版本
node -v     # 建议 >= 18.x
pnpm -v     # 建议 >= 9.x
```

### 5.2 安装依赖

```bash
# 在项目根目录
pnpm install
```

### 5.3 启动开发服务器

```bash
# 方式 1：在根目录运行
pnpm dev

# 方式 2：在 stage-web 目录运行
cd apps/stage-web
pnpm dev

# 启动后访问
http://localhost:5173
```

### 5.4 常用命令

```bash
# 类型检查
pnpm typecheck

# 代码检查
pnpm lint

# 构建生产版本
pnpm build

# 预览生产构建
pnpm preview
```

---

## 6. 核心模块深入

### 6.1 页面入口：`pages/index.vue`

这是应用的主页面，展示虚拟角色和交互界面。

**核心要素**：

```vue
<script setup lang="ts">
// 1. 引入核心组件
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'

import Header from '../components/Layouts/Header.vue'
import InteractiveArea from '../components/Layouts/InteractiveArea.vue'

// 2. 响应式状态
const dark = useDark() // 暗色模式
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md') // 移动端检测

// 3. Live2D 状态
const { scale, position } = storeToRefs(useLive2d())
</script>

<template>
  <!-- 背景层 -->
  <Cross>
    <AnimatedWave>
      <!-- 内容层 -->
      <div flex="~ col" h-100dvh w-100vw>
        <!-- 顶部导航 -->
        <Header />

        <!-- 主舞台区域 -->
        <WidgetStage
          :focus-at="{ x: mouseX, y: mouseY }"
          :scale="scale"
        />

        <!-- 交互区域（聊天、设置等） -->
        <InteractiveArea />
      </div>
    </AnimatedWave>
  </Cross>
</template>

<route lang="yaml">
meta:
  layout: stage
  stageTransition:
    name: bubble-wave-out
</route>
```

**关键点**：
- 使用 `<route>` 块定义页面元信息（需要 `unplugin-vue-router`）
- 响应式布局：桌面端显示 `InteractiveArea`，移动端显示 `MobileInteractiveArea`
- 鼠标追踪：Live2D 模型眼睛会跟随鼠标移动

### 6.2 交互区域：`components/Layouts/InteractiveArea.vue`

负责聊天输入、历史记录显示和语音交互。

**功能流程**：

```
用户输入
  ↓
发送消息 (send)
  ↓
调用 LLM API
  ↓
流式接收响应
  ↓
更新聊天历史
  ↓
触发 TTS 播放
  ↓
Live2D 嘴型同步
```

**代码结构**：

```vue
<script setup lang="ts">
// 1. 语音识别
const { transcribe, terminate } = useWhisper(WhisperWorker, {
  onComplete: async (text) => {
    // 将识别结果发送到 LLM
    await send(text, { chatProvider, model })
  }
})

// 2. 语音活动检测（VAD）
const { start, destroy } = useMicVAD(selectedAudioInput, {
  onSpeechStart: () => listening.value = true,
  onSpeechEnd: (buffer) => {
    // 发送音频到 Whisper
    handleTranscription(buffer.buffer)
  }
})

// 3. 文本输入处理
async function handleSend() {
  const providerConfig = providersStore.getProviderConfig(activeProvider)
  await send(messageInput.value, {
    chatProvider,
    model,
    providerConfig
  })
}
</script>

<template>
  <div>
    <!-- 聊天历史 -->
    <ChatHistory />

    <!-- 输入框 -->
    <BasicTextarea
      v-model="messageInput"
      @submit="handleSend"
    />

    <!-- 功能按钮 -->
    <button @click="cleanupMessages">
清除历史
</button>
    <button @click="isDark = !isDark">
切换主题
</button>
  </div>
</template>
```

### 6.3 聊天历史：`components/Widgets/ChatHistory.vue`

显示对话历史，支持自动滚动和 Markdown 渲染。

**关键特性**：

```vue
<script setup lang="ts">
const { messages, sending, streamingMessage } = storeToRefs(useChatStore())

// 自动滚动到最新消息
onTokenLiteral(async () => {
  nextTick().then(() => {
    chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight
  })
})
</script>

<template>
  <div ref="chatHistoryRef" overflow-scroll>
    <!-- 遍历历史消息 -->
    <div v-for="message in messages">
      <!-- 错误消息 -->
      <div v-if="message.role === 'error'" class="bg-violet-50">
        <MarkdownRenderer :content="message.content" />
      </div>

      <!-- AI 回复 -->
      <div v-else-if="message.role === 'assistant'" class="bg-primary-50">
        <MarkdownRenderer :content="message.content" />
      </div>

      <!-- 用户消息 -->
      <div v-else-if="message.role === 'user'" class="bg-cyan-50">
        <MarkdownRenderer :content="message.content" />
      </div>
    </div>

    <!-- 流式消息（正在生成） -->
    <div v-if="sending">
      <MarkdownRenderer :content="streamingMessage.content" />
    </div>
  </div>
</template>
```

### 6.4 舞台组件：`@proj-airi/stage-ui/components/scenes/Stage.vue`

核心渲染组件，根据设置选择 Live2D 或 VRM 渲染器。

**渲染选择逻辑**：

```vue
<script setup lang="ts">
const { stageModelRenderer, stageModelSelectedUrl } = storeToRefs(useSettings())

// stageModelRenderer 的值决定渲染器：
// - 'live2d' → 使用 Live2DScene
// - 'vrm' → 使用 ThreeScene
// - 'disabled' → 不显示模型
</script>

<template>
  <!-- Live2D 渲染器 -->
  <Live2DScene
    v-if="stageModelRenderer === 'live2d'"
    :model-src="stageModelSelectedUrl"
    :focus-at="focusAt"
    :mouth-open-size="mouthOpenSize"
  />

  <!-- VRM 渲染器 -->
  <ThreeScene
    v-else-if="stageModelRenderer === 'vrm'"
    :model-src="stageModelSelectedUrl"
    :current-audio-source="audioSource"
  />
</template>
```

### 6.5 音频处理流程

**VAD（语音活动检测）→ STT（语音识别）→ LLM → TTS（语音合成）→ 嘴型同步**

```typescript
// 1. VAD 检测到语音
useMicVAD(audioInput, {
  onSpeechEnd: (buffer) => {
    // 2. 将音频发送到 Whisper
    const audioBase64 = await toWAVBase64(buffer, sampleRate)
    transcribe({ audio: audioBase64 })
  }
})

// 3. Whisper Worker 识别文本
useWhisper(WhisperWorker, {
  onComplete: async (text) => {
    // 4. 发送到 LLM
    await send(text, { chatProvider, model })
  }
})

// 5. LLM 响应流式返回
send(text, options) // → 触发 onTokenLiteral 回调

// 6. TTS 生成语音
generateSpeech(text, { provider, voice })

// 7. 播放音频 + 嘴型同步
playAudio(audioBuffer)
lipSync.update(amplitude)
```

---

## 7. 实战开发指南

### 7.1 添加新页面

**步骤 1**：在 `src/pages/` 创建文件

```vue
<!-- src/pages/my-feature.vue -->
<script setup lang="ts">
import { ref } from 'vue'

const message = ref('Hello, AIRI!')
</script>

<template>
  <div>
    <h1>{{ message }}</h1>
  </div>
</template>

<route lang="yaml">
meta:
  layout: home
</route>
```

**步骤 2**：访问 `http://localhost:5173/my-feature`

路由自动生成，无需手动配置！

### 7.2 创建新组件

**步骤 1**：在 `src/components/` 创建组件

```vue
<!-- src/components/MyWidget.vue -->
<script setup lang="ts">
interface Props {
  title: string
  count?: number
}

const props = withDefaults(defineProps<Props>(), {
  count: 0
})

const emit = defineEmits<{
  increment: []
}>()
</script>

<template>
  <div border="1 solid gray-300" rounded p-4>
    <h2>{{ title }}</h2>
    <p>Count: {{ count }}</p>
    <button @click="emit('increment')">
+1
</button>
  </div>
</template>
```

**步骤 2**：在页面中使用

```vue
<script setup lang="ts">
import { ref } from 'vue'

import MyWidget from '../components/MyWidget.vue'

const count = ref(0)
</script>

<template>
  <MyWidget
    title="My Counter"
    :count="count"
    @increment="count++"
  />
</template>
```

### 7.3 使用 UnoCSS 样式

AIRI 使用 UnoCSS（类似 Tailwind）进行样式编写：

```vue
<template>
  <!-- 布局 -->
  <div flex="~ col"    h-screen items-center justify-center >
<!-- 文本样式 -->
    <h1 text="3xl primary-600" font-bold>
      标题
    </h1>

    <!-- 背景和边框 -->
    <div
      bg="primary-50 dark:primary-900"
      border="2 solid primary-200"
      rounded-lg
      p-4
    >
      内容
    </div>

    <!-- 响应式 -->
    <div
      w="full md:1/2 lg:1/3"
      p="2 md:4 lg:6"
    >
      响应式容器
    </div>

    <!-- 过渡效果 -->
    <button
      transition="all duration-300"
      hover:bg="primary-500"
      active:scale-95
    >
      按钮
    </button>
  </div>
</template>
```

**UnoCSS 配置**：

- `uno.config.ts`：项目级配置
- 根目录 `uno.config.ts`：全局共享配置
- 主题变量：`--chromatic-hue`（动态色相）

### 7.4 创建 Composable

**步骤 1**：在 `src/composables/` 创建文件

```typescript
// src/composables/use-counter.ts
import { computed, ref } from 'vue'

export function useCounter(initialValue = 0) {
  const count = ref(initialValue)
  const double = computed(() => count.value * 2)

  function increment() {
    count.value++
  }

  function decrement() {
    count.value--
  }

  function reset() {
    count.value = initialValue
  }

  return {
    count,
    double,
    increment,
    decrement,
    reset
  }
}
```

**步骤 2**：在组件中使用

```vue
<script setup lang="ts">
import { useCounter } from '../composables/use-counter'

const { count, double, increment, decrement } = useCounter(10)
</script>

<template>
  <div>
    <p>Count: {{ count }}</p>
    <p>Double: {{ double }}</p>
    <button @click="increment">
+
</button>
    <button @click="decrement">
-
</button>
  </div>
</template>
```

### 7.5 使用 Pinia Store

**步骤 1**：在 `src/stores/` 创建 store

```typescript
// src/stores/my-feature.ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useMyFeatureStore = defineStore('my-feature', () => {
  // 状态
  const items = ref<string[]>([])
  const loading = ref(false)

  // 计算属性
  const itemCount = computed(() => items.value.length)

  // 方法
  async function fetchItems() {
    loading.value = true
    try {
      const response = await fetch('/api/items')
      items.value = await response.json()
    }
 finally {
      loading.value = false
    }
  }

  function addItem(item: string) {
    items.value.push(item)
  }

  return {
    items,
    loading,
    itemCount,
    fetchItems,
    addItem
  }
})
```

**步骤 2**：在组件中使用

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useMyFeatureStore } from '../stores/my-feature'

const store = useMyFeatureStore()
const { items, loading, itemCount } = storeToRefs(store)
const { fetchItems, addItem } = store

onMounted(() => {
  fetchItems()
})
</script>

<template>
  <div>
    <p v-if="loading">
加载中...
</p>
    <p v-else>
共 {{ itemCount }} 项
</p>
    <ul>
      <li v-for="item in items" :key="item">
{{ item }}
</li>
    </ul>
    <button @click="addItem('新项目')">
添加
</button>
  </div>
</template>
```

### 7.6 集成 LLM API

使用 `@proj-airi/stage-ui` 的聊天功能：

```vue
<script setup lang="ts">
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'

const chatStore = useChatStore()
const providersStore = useProvidersStore()
const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())

async function sendMessage(text: string) {
  const providerConfig = providersStore.getProviderConfig(activeProvider.value)
  const chatProvider = await providersStore.getProviderInstance(activeProvider.value)

  await chatStore.send(text, {
    chatProvider,
    model: activeModel.value,
    providerConfig
  })
}
</script>

<template>
  <div>
    <button @click="sendMessage('你好！')">
      发送消息
    </button>
  </div>
</template>
```

### 7.7 添加国际化

**步骤 1**：在 `packages/i18n/src/locales/` 添加翻译

```yaml
# packages/i18n/src/locales/zh-Hans.yaml
my-feature:
  title: 我的功能
  button:
    submit: 提交
    cancel: 取消
```

```yaml
# packages/i18n/src/locales/en.yaml
my-feature:
  title: My Feature
  button:
    submit: Submit
    cancel: Cancel
```

**步骤 2**：在组件中使用

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div>
    <h1>{{ t('my-feature.title') }}</h1>
    <button>{{ t('my-feature.button.submit') }}</button>
    <button>{{ t('my-feature.button.cancel') }}</button>
  </div>
</template>
```

---

## 8. 调试技巧

### 8.1 Vue DevTools

```bash
# 已集成 vite-plugin-vue-devtools
# 开发时自动启用，访问：
http://localhost:5173/__devtools__
```

**功能**：
- 组件树查看
- 状态检查（Pinia stores）
- 事件追踪
- 性能分析

### 8.2 浏览器控制台技巧

```javascript
// 访问 Pinia stores
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'

// 访问路由
import { useRouter } from 'vue-router'

// 访问 i18n
import { useI18n } from 'vue-i18n'
const chat = useChatStore()
console.log(chat.messages)
const router = useRouter()
console.log(router.currentRoute.value)

const { t, locale } = useI18n()
console.log(locale.value)
```

### 8.3 网络请求调试

```typescript
// 在 vite.config.ts 添加代理
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
```

### 8.4 性能分析

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  console.time('Component Mount Time')
})

onUnmounted(() => {
  console.timeEnd('Component Mount Time')
})
</script>
```

**使用 Vite Bundle Visualizer**：

```bash
pnpm build
# 查看生成的 stats.html
```

---

## 9. 常见问题

### 9.1 类型错误

**问题**：导入 `@proj-airi/*` 包时提示找不到模块

**解决**：

1. 检查 `vite.config.ts` 中的别名配置
2. 运行 `pnpm typecheck` 查看详细错误
3. 重启 VSCode TypeScript 服务器（Ctrl+Shift+P → Restart TS Server）

### 9.2 样式不生效

**问题**：UnoCSS 类名不起作用

**解决**：

1. 检查 `uno.config.ts` 配置
2. 确保导入了 `uno.css`（在 `main.ts` 中）
3. 使用 `<script setup>` 而非 Options API（部分 UnoCSS 功能仅支持 Composition API）

### 9.3 Live2D 模型不显示

**问题**：模型加载失败或不显示

**解决**：

1. 检查模型文件是否在 `public/assets/live2d/models/` 目录
2. 查看浏览器控制台是否有 CORS 错误
3. 确认 `stageModelSelected` 值正确（在 Settings store 中）
4. 检查 IndexedDB 中是否有模型记录

### 9.4 音频权限问题

**问题**：麦克风无法使用

**解决**：

1. 检查浏览器是否授予麦克风权限
2. 使用 HTTPS 或 localhost（某些浏览器要求安全上下文）
3. 在 `useSettingsAudioDevice` store 中调用 `askPermission()`

### 9.5 构建错误

**问题**：`pnpm build` 失败

**解决**：

```bash
# 1. 清理缓存
rm -rf node_modules/.vite

# 2. 重新安装依赖
pnpm install

# 3. 检查类型错误
pnpm typecheck

# 4. 尝试构建
pnpm build
```

### 9.6 开发服务器卡顿

**问题**：HMR（热更新）很慢

**解决**：

1. 在 `vite.config.ts` 中排除大文件：

```typescript
export default defineConfig({
  optimizeDeps: {
    exclude: ['@proj-airi/stage-ui/*', 'public/assets/*']
  }
})
```

2. 使用 `server.warmup` 预热常用文件

---

## 附录

### A. 推荐 VSCode 插件

- **Vue - Official**（Volar）
- **UnoCSS**
- **ESLint**
- **TypeScript Vue Plugin (Volar)**
- **i18n Ally**

### B. 推荐学习资源

- [Vue 3 官方文档](https://vuejs.org/)
- [Pinia 官方文档](https://pinia.vuejs.org/)
- [UnoCSS 官方文档](https://unocss.dev/)
- [Vite 官方文档](https://vitejs.dev/)
- [TresJS 官方文档](https://tresjs.org/)

### C. 项目相关链接

- [AIRI GitHub 仓库](https://github.com/moeru-ai/airi)
- [项目文档站](https://airi.moeru.ai/docs)
- [Discord 社区](https://discord.gg/airi)

---

**祝你开发愉快！🎉**

如有疑问，请查阅项目 README 或在 Discord 社区提问。
