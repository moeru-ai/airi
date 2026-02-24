# AIRI 项目 Monorepo 架构与测试配置详解

本文档详细介绍项目的 Monorepo 架构设计和测试配置。

---

## 目录

- [一、Monorepo 架构概览](#一monorepo-架构概览)
- [二、工作空间定义](#二工作空间定义)
- [三、目录结构详解](#三目录结构详解)
- [四、依赖管理机制](#四依赖管理机制)
- [五、构建系统](#五构建系统)
- [六、包间依赖关系](#六包间依赖关系)
- [七、版本管理](#七版本管理)
- [八、开发工作流](#八开发工作流)
- [九、Vitest 测试配置](#九vitest-测试配置)
- [十、架构优势总结](#十架构优势总结)

---

## 一、Monorepo 架构概览

本项目采用 **pnpm + Turborepo** 的 Monorepo 架构，同时整合了 **Rust/Cargo 工作空间**，实现了前后端一体化的多包管理。

```
┌─────────────────────────────────────────────────────────────────┐
│                        Monorepo Root                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    pnpm Workspace                           ││
│  │  packages/  │  apps/  │  plugins/  │  services/  │  docs/   ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Cargo Workspace                          ││
│  │  crates/  │  apps/stage-tamagotchi/src-tauri/               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、工作空间定义

### pnpm 工作空间 (`pnpm-workspace.yaml`)

```yaml
packages:
  - packages/**      # 核心库
  - plugins/**       # 插件
  - services/**      # 服务
  - examples/**      # 示例
  - docs/**          # 文档
  - apps/**          # 应用
  - '!**/dist/**'    # 排除构建产物
```

### Cargo 工作空间 (`Cargo.toml`)

```toml
[workspace]
members = [
  "crates/tauri-plugin-ipc-audio-transcription-ort",
  "crates/tauri-plugin-ipc-audio-vad-ort",
  "crates/tauri-plugin-mcp",
  "crates/tauri-plugin-rdev",
  "crates/tauri-plugin-window-pass-through-on-hover",
  "crates/tauri-plugin-window-router-link",
  "apps/stage-tamagotchi/src-tauri"
]
resolver = "2"
```

---

## 三、目录结构详解

### 1. `packages/` - 核心库 (26 个包)

| 分类 | 包名 | 功能 |
|------|------|------|
| **UI 组件** | `stage-ui` | Vue 组件库 |
| | `stage-ui-three` | Three.js 3D 组件 |
| | `ui` | 基础 UI 组件 |
| | `ui-loading-screens` | 加载动画 |
| | `ui-transitions` | 过渡动画 |
| **页面模块** | `stage-pages` | 共享页面组件 |
| | `stage-shared` | 共享工具和状态 |
| **音频处理** | `audio` | 音频核心库 |
| | `pipelines-audio` | 音频处理管道 |
| **AI 能力** | `core-character` | 角色核心逻辑 |
| | `memory-pgvector` | 向量记忆存储 |
| **服务端** | `server-runtime` | 服务端运行时 |
| | `server-sdk` | 服务端 SDK |
| | `server-shared` | 服务端共享代码 |
| **数据库** | `duckdb-wasm` | DuckDB WASM 封装 |
| | `drizzle-duckdb-wasm` | Drizzle ORM 适配 |
| **国际化** | `i18n` | 多语言支持 |
| **依赖注入** | `injecta` | IoC 容器 |
| **字体包** | `font-cjkfonts-allseto` | 中文字体 |
| | `font-departure-mono` | 等宽字体 |
| | `font-xiaolai` | 小赖字体 |
| **3D 渲染** | `tresjs` | Tres.js 封装 |
| **工具** | `ccc` | 命令行工具 |
| | `unocss-preset-fonts` | UnoCSS 字体预设 |

### 2. `apps/` - 应用入口 (3 个应用)

| 应用 | 技术栈 | 说明 |
|------|--------|------|
| `stage-web` | Vue + Vite | Web 应用，浏览器访问 |
| `stage-tamagotchi` | Electron + Tauri | 桌面应用，功能最全 |
| `component-calling` | Vue + Vite | 组件演示/调用示例 |

### 3. `plugins/` - 扩展插件 (3 个)

| 插件 | 目标平台 | 功能 |
|------|----------|------|
| `airi-plugin-vscode` | VS Code | 编辑器集成 |
| `airi-plugin-web-extension` | 浏览器 | 浏览器扩展 |
| `airi-plugin-claude-code` | Claude Code | AI 编程助手集成 |

### 4. `services/` - 后端服务 (4 个)

| 服务 | 平台 | 功能 |
|------|------|------|
| `discord-bot` | Discord | Discord 机器人 |
| `telegram-bot` | Telegram | Telegram 机器人 |
| `minecraft` | Minecraft | Minecraft 代理 |
| `twitter-services` | Twitter/X | 社交媒体集成 |

### 5. `crates/` - Rust 原生插件 (6 个)

| 插件 | 功能 |
|------|------|
| `tauri-plugin-ipc-audio-transcription-ort` | 语音识别 |
| `tauri-plugin-ipc-audio-vad-ort` | 语音活动检测 |
| `tauri-plugin-mcp` | MCP 协议客户端 |
| `tauri-plugin-rdev` | 输入设备监听 |
| `tauri-plugin-window-pass-through-on-hover` | 窗口穿透 |
| `tauri-plugin-window-router-link` | 窗口路由 |

---

## 四、依赖管理机制

### 1. Catalog 统一版本

pnpm 的 catalog 功能实现跨包依赖版本统一：

```yaml
# pnpm-workspace.yaml
catalog:
  '@guiiai/logg': 1.1.0
  '@xsai/embed': ^0.4.0-beta.5
  '@xsai/generate-text': ^0.4.0-beta.5
  # ...

catalogs:
  rolldown-vite:
    vite: npm:rolldown-vite@^7.1.20
```

子包引用方式：
```json
{
  "dependencies": {
    "@guiiai/logg": "catalog:",
    "@xsai/embed": "catalog:"
  }
}
```

### 2. Overrides 覆盖依赖

解决安全问题和 polyfill：
```json
"pnpm": {
  "overrides": {
    "axios": "npm:feaxios@^0.0.23",
    "safe-buffer": "npm:@nolyfill/safe-buffer@^1.0.44"
  }
}
```

### 3. onlyBuiltDependencies 按需构建

仅对原生依赖执行编译：
```json
"onlyBuiltDependencies": [
  "electron",
  "onnxruntime-node",
  "sharp",
  "esbuild"
]
```

---

## 五、构建系统

### 1. Turborepo 任务编排

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": {
      "outputs": ["dist/**"]
    }
  }
}
```

特性：
- **增量构建**：只构建变更的包
- **并行执行**：无依赖的任务并行运行
- **缓存**：构建结果缓存，加速 CI

### 2. 构建命令

```bash
# 构建所有包和应用
pnpm build
# 等同于
turbo run build -F="./packages/*" -F="./apps/*"

# 构建特定目标
pnpm build:web        # 仅 Web 应用
pnpm build:tamagotchi # 仅桌面应用
pnpm build:packages   # 仅核心库
pnpm build:crates     # Rust 工作空间
```

---

## 六、包间依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                         apps/                               │
│  stage-web ◄─────────────────────────────────────────────── │
│  stage-tamagotchi ◄──────────────────────────────────────── │
└────────────────────────┬────────────────────────────────────┘
                         │ 依赖
┌────────────────────────▼────────────────────────────────────┐
│                      packages/                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │stage-ui │  │stage-   │  │i18n     │  │audio    │       │
│  │         │  │pages    │  │         │  │         │       │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
│       │            │            │            │              │
│  ┌────▼────────────▼────────────▼────────────▼────┐       │
│  │              stage-shared                       │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                       crates/                               │
│  Rust 原生插件（通过 Tauri IPC 与前端通信）                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、版本管理

### 统一版本号

```toml
# Cargo.toml
[workspace.package]
version = "0.7.2-beta.3"
```

```json
// package.json
{
  "version": "0.7.2-beta.3"
}
```

### 版本发布流程 (`bump.config.ts`)

```typescript
export default defineConfig({
  recursive: true,        // 递归更新所有包
  commit: 'release: v%s', // 提交信息
  sign: true,             // GPG 签名
  execute: async () => {
    // 同步 Cargo.toml 版本
    cargoToml.workspace.package.version = packageJSON.version
  }
})
```

---

## 八、开发工作流

### 启动开发服务

```bash
# Web 应用
pnpm dev          # 默认启动 stage-web
pnpm dev:web      # 显式指定

# 桌面应用
pnpm dev:tamagotchi

# 文档
pnpm dev:docs

# UI 组件库
pnpm dev:ui       # 启动 Storybook

# 并行启动所有应用
pnpm dev:apps
```

### 包过滤语法

```bash
# 过滤特定包
pnpm -F @proj-airi/stage-ui build
pnpm -F @proj-airi/stage-web dev

# 过滤目录
pnpm -F="./packages/*" build
pnpm -F="./apps/*" test

# 排除模式
pnpm -F "!@proj-airi/docs" build
```

---

## 九、Vitest 测试配置

### 配置文件

**文件路径**: `/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/injecta',
      'packages/stage-ui',
    ],
  },
})
```

### 配置项说明

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `test.projects` | `['packages/injecta', 'packages/stage-ui']` | 工作空间模式，指定测试项目 |

### 工作空间模式 (Workspace Mode)

这种配置方式是 Vitest 的 **Workspace 特性**，允许：

1. **多项目独立配置**：每个子项目可以有自己的 `vitest.config.ts`
2. **统一运行**：根目录执行 `pnpm test` 会同时运行所有项目测试
3. **独立隔离**：各项目测试互不干扰，可使用不同配置

```
vitest.config.ts (根配置 - 工作空间定义)
    │
    ├── packages/injecta/
    │   └── vitest.config.ts (子项目独立配置)
    │
    └── packages/stage-ui/
        └── vitest.config.ts (子项目独立配置)
```

### 当前测试覆盖范围

| 包名 | 功能 | 测试内容 |
|------|------|----------|
| `packages/injecta` | 依赖注入容器 | IoC 容器、服务注册解析 |
| `packages/stage-ui` | UI 组件库 | Vue 组件、组合式函数 |

### 相关命令

```bash
# 运行所有测试
pnpm test

# 运行测试并生成覆盖率报告
pnpm test --coverage

# 只运行一次（不监听）
pnpm test:run

# 运行特定项目的测试
pnpm -F @proj-airi/injecta test
pnpm -F @proj-airi/stage-ui test
```

### 为什么使用工作空间模式？

1. **Monorepo 架构**：项目有多个独立包，测试配置可能不同
2. **按需加载**：未修改的包可跳过测试，提高 CI 效率
3. **灵活配置**：不同包可使用不同的测试环境（如 jsdom、happy-dom、node）
4. **统一入口**：一个命令运行所有测试，便于 CI/CD

---

## 十、架构优势总结

| 特性 | 说明 |
|------|------|
| **代码复用** | 共享组件、工具、类型定义 |
| **统一依赖** | catalog 确保版本一致 |
| **增量构建** | Turborepo 缓存加速 CI |
| **独立发布** | 每个包可独立发布到 npm |
| **类型安全** | 跨包类型引用，IDE 智能提示 |
| **职责分离** | UI/逻辑/服务清晰分层 |
| **多端适配** | Web/桌面/机器人共用核心代码 |

### 项目规模统计

- **26 个核心库** 提供可复用能力
- **3 个应用** 覆盖 Web/桌面场景
- **3 个插件** 扩展生态
- **4 个服务** 对接外部平台
- **6 个 Rust 插件** 提供原生能力

通过 pnpm + Turborepo + Cargo 的组合，实现了高效的跨平台开发和构建体验。
