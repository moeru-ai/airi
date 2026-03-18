# AIRI 视觉系统集成规格文档

## 一、背景与目标

### 1.1 为什么需要视觉系统

当前 AIRI 缺乏对屏幕内容的感知能力，无法主动了解用户当前界面的状态。通过集成视觉系统，AIRI 将能够：
- 感知屏幕内容，理解用户当前在做什么
- 根据屏幕上下文做出更智能的响应
- 执行自动化操作（如点击按钮、输入文本等）

### 1.2 技术选型说明

**MidsceneJS** 是字节跳动开源的 AI 驱动 UI 自动化工具，主要基于 Playwright 运行在 Web 环境。要在 Electron 桌面端实现**整个桌面**的操控，需要结合以下技术栈：

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 桌面截屏 | `desktopCapturer` (Electron API) | 获取整个屏幕/窗口的画面 |
| 桌面控制 | `nut-js` 或 `robotjs` | 执行鼠标点击、键盘输入等操作 |
| 视觉理解 | MidsceneJS 封装 | 调用多模态 AI 分析截图 |
| AI 模型 | 与 AIRI 现有模型系统集成 | 支持本地/云端模型切换 |

> **技术说明**：由于 MidsceneJS 原生依赖 Playwright，不适合直接用于桌面操控。因此采用"截屏 + AI 分析 + nut-js 控制"的架构，MidsceneJS 仅作为 AI 分析层的封装。

---

## 二、功能规格

### 2.1 核心功能

#### 功能 1：屏幕感知（Screenshot）

- **自动感知**：无屏幕变化时定期截屏（可配置间隔，默认 30 秒）
- **事件感知**：检测到屏幕变化（窗口切换、应用切换）时立即截屏
- **手动触发**：用户通过 UI 按钮主动触发截屏
- **冷却机制**：内置防抖机制，避免频繁触发（默认冷却 5 秒）

#### 功能 2：屏幕分析（Analyze）

- 调用多模态 AI 模型分析截图内容
- 生成屏幕描述、识别 UI 元素位置
- 将分析结果作为上下文传递给 AIRI

#### 功能 3：智能交互（Interact）

- 支持自然语言指令（如"点击确认按钮"、"打开设置"）
- AI 解析指令并转换为坐标操作
- 通过桌面控制库执行鼠标/键盘操作

### 2.2 用户交互流程

```
┌─────────────────────────────────────────────────────────────┐
│                      用户触发方式                            │
├─────────────────────┬───────────────────────────────────────┤
│      自动触发        │              手动触发                  │
│  ┌───────────────┐  │  ┌─────────────────────────────────┐ │
│  │ 1. 定期截屏    │  │  │ 1. 用户点击"让 AIRI 看屏幕"按钮 │ │
│  │ 2. 变化检测    │  │  │ 2. 截取当前屏幕                  │ │
│  │ 3. 冷却机制    │  │  │ 3. AI 分析并反馈                 │ │
│  └───────┬────────┘  │  └──────────────┬────────────────┘ │
│          │           │                   │                   │
│          └───────────┼───────────────────┘                   │
│                      ▼                                       │
│            ┌─────────────────┐                                │
│            │   AI 屏幕分析   │                                │
│            │  - 描述界面内容  │                                │
│            │  - 识别关键元素  │                                │
│            │  - 定位交互坐标  │                                │
│            └────────┬────────┘                                │
│                     │                                         │
│                     ▼                                         │
│            ┌─────────────────┐                                │
│            │   AIRI 响应     │                                │
│            │  - 理解上下文    │                                │
│            │  - 智能对话      │                                │
│            └────────┬────────┘                                │
│                     │                                         │
│                     ▼                                         │
│            ┌─────────────────┐                                │
│            │  可选：执行操作  │  ← 用户可选择启用              │
│            │  - 点击/输入    │                                │
│            │  - 自动化流程   │                                │
│            └─────────────────┘                                │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 模块设计

#### 模块 1：VisionService（视觉服务）

```
位置：packages/stage-ui/src/services/vision.ts

职责：
- 截屏管理（自动/手动）
- 屏幕变化检测
- 冷却时间控制

API：
- captureScreen(): Promise<Buffer>        // 截取屏幕
- enableAutoCapture(interval: number): void // 启用自动截屏
- disableAutoCapture(): void              // 禁用自动截屏
- captureNow(): Promise<void>              // 立即截屏（带冷却）
```

#### 模块 2：VisionAnalyzer（视觉分析）

```
位置：packages/stage-ui/src/services/vision-analyzer.ts

职责：
- 调用 AI 模型分析截图
- 解析屏幕元素位置
- 生成结构化分析结果

API：
- analyzeScreen(image: Buffer): Promise<ScreenAnalysis>
- findElement(description: string): Promise<ElementPosition>
- executeAction(action: string): Promise<void>
```

#### 模块 3：DesktopController（桌面控制）

```
位置：packages/stage-ui/src/services/desktop-controller.ts

职责：
- 鼠标操作（移动、点击、拖拽）
- 键盘操作（输入、快捷键）
- 窗口管理

API：
- click(x: number, y: number): Promise<void>
- type(text: string): Promise<void>
- hotkey(keys: string[]): Promise<void>
- getScreenSize(): ScreenSize
```

### 2.4 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `vision.autoCapture.enabled` | boolean | false | 是否启用自动截屏 |
| `vision.autoCapture.interval` | number | 30000 | 自动截屏间隔（毫秒） |
| `vision.cooldown` | number | 5000 | 冷却时间（毫秒） |
| `vision.modelProvider` | string | "openai" | 默认 AI 模型提供商 |
| `vision.modelName` | string | "gpt-4o" | 默认模型名称 |

---

## 三、技术架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     stage-tamagotchi (Electron)                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐   │
│  │  Renderer   │   │   Main      │   │   Desktop           │   │
│  │  Process    │   │   Process   │   │   (OS Level)       │   │
│  │             │   │             │   │                     │   │
│  │ ┌─────────┐ │   │ ┌─────────┐ │   │ ┌─────────────────┐ │   │
│  │ │ AIRI    │ │   │ │ Vision  │ │   │ │ desktopCapturer│ │   │
│  │ │ Core    │ │   │ │ Service │ │◄──►│ │ (Electron API) │ │   │
│  │ └────┬────┘ │   │ └────┬────┘ │   │ └────────┬────────┘ │   │
│  │      │      │   │      │      │   │          │          │   │
│  │ ┌────┴────┐ │   │ ┌────┴────┐ │   │          ▼          │   │
│  │ │ Vision  │ │   │ │ Desktop │ │   │ ┌─────────────────┐ │   │
│  │ │ Module  │ │◄─►│ │Controller│◄─►│ │ nut-js / robotjs│ │   │
│  │ └─────────┘ │   │ └─────────┘ │   │ └─────────────────┘ │   │
│  └─────────────┘   └─────────────┘   └─────────────────────┘   │
│         │                 │                                       │
│         └─────────────────┴───────────────────────────────────┐  │
│                           │                                       │  │
│                           ▼                                       │  │
│              ┌────────────────────────┐                          │  │
│              │   AI Model Provider   │                          │  │
│              │  ┌──────────────────┐ │                          │  │
│              │  │ OpenAI / Claude  │ │                          │  │
│              │  │ Ollama (本地)    │ │                          │  │
│              │  │ AIRI 现有模型    │ │                          │  │
│              │  └──────────────────┘ │                          │  │
│              └────────────────────────┘                          │  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 IPC 通信设计

由于截屏和控制需要 Main Process 权限，Renderer 与 Main 之间通过 Eventa 进行 IPC 通信：

| 事件名 | 方向 | 负载 | 说明 |
|--------|------|------|------|
| `vision:capture` | Renderer → Main | - | 请求截屏 |
| `vision:screenshot` | Main → Renderer | `base64` | 返回截图数据 |
| `vision:analyze` | Renderer → Main | `{image, prompt}` | 请求分析 |
| `vision:result` | Main → Renderer | `AnalysisResult` | 返回分析结果 |
| `vision:execute` | Renderer → Main | `ActionRequest` | 执行操作 |
| `vision:screen-change` | Main → Renderer | - | 屏幕变化通知 |

### 3.3 依赖包

| 包名 | 版本 | 用途 |
|------|------|------|
| `midscenejs` | ^1.x | AI 分析层封装 |
| `@nut-tree/nut-js` | ^4.x | 桌面控制（更现代） |
| 或 `robotjs` | ^0.6.x | 桌面控制（更轻量） |

---

## 四、验收标准

### 4.1 功能验收

- [ ] 能够截取当前桌面/窗口的截图
- [ ] 能够调用 AI 模型分析截图内容
- [ ] 能够通过自然语言指令执行桌面操作
- [ ] 自动截屏功能正常工作
- [ ] 手动触发功能正常工作
- [ ] 冷却机制有效防止频繁触发

### 4.2 集成验收

- [ ] 与 AIRI 现有模型系统集成（可切换本地/云端）
- [ ] 与 Electron Main/Renderer 进程正确集成
- [ ] IPC 通信正常工作

### 4.3 体验验收

- [ ] 截屏和分析过程有适当的加载提示
- [ ] 错误处理友好（截屏失败、AI 超时等）
- [ ] 配置项可通过设置页面调整

---

## 五、影响范围

### 5.1 受影响的功能

- **AIRI 对话系统**：新增屏幕上下文理解能力
- **设置页面**：新增视觉系统配置项
- **系统托盘**：可选显示视觉系统状态

### 5.2 受影响的代码路径

| 文件路径 | 修改类型 |
|----------|----------|
| `packages/stage-ui/src/services/` | 新增视觉服务模块 |
| `apps/stage-tamagotchi/src/main/services/` | 新增 IPC 处理 |
| `apps/stage-tamagotchi/src/renderer/stores/` | 新增视觉状态管理 |
| `packages/i18n/` | 新增视觉相关翻译 |

---

## 六、里程碑

1. **M1**：基础截屏功能（Electron desktopCapturer）
2. **M2**：AI 屏幕分析集成（MidsceneJS + 模型切换）
3. **M3**：桌面控制功能（nut-js 集成）
4. **M4**：自动感知与触发机制
5. **M5**：与 AIRI 对话系统的深度集成

