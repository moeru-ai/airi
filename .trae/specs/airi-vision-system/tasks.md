# AIRI 视觉系统集成 - 任务清单

## 任务总览

| 阶段 | 任务数 | 描述 |
|------|--------|------|
| M1 - 基础截屏 | 4 | 搭建基础设施，实现 Electron 截屏功能 |
| M2 - AI 分析 | 4 | 集成 MidsceneJS 和模型切换 |
| M3 - 桌面控制 | 4 | 集成 nut-js 实现操作能力 |
| M4 - 自动感知 | 3 | 实现自动触发与冷却机制 |
| M5 - AIRI 集成 | 3 | 与 AIRI 对话系统深度集成 |

---

## M1：基础截屏功能

### 任务 1.1：创建视觉服务模块

**描述**：在 `packages/stage-ui/src/services/` 创建核心视觉服务

**子任务**：
- [ ] 创建 `packages/stage-ui/src/services/vision.ts` - VisionService 类
- [ ] 定义截屏方法 `captureScreen()` 返回 Buffer
- [ ] 实现配置管理（autoCapture、cooldown 等）

**验收**：VisionService 可以在 Renderer 中被正常调用

---

### 任务 1.2：实现 Main Process 截屏 IPC

**描述**：在 Electron Main Process 中实现截屏能力

**子任务**：
- [ ] 在 `apps/stage-tamagotchi/src/main/services/` 创建 `vision.ts`
- [ ] 使用 `desktopCapturer` API 获取屏幕截图
- [ ] 注册 Eventa IPC 事件 `vision:capture` 和 `vision:screenshot`

**验收**：Renderer 可以请求并接收到 Base64 截图数据

---

### 任务 1.3：创建 Renderer 端视觉 Store

**描述**：在 Renderer 进程创建 Pinia store 管理视觉状态

**子任务**：
- [ ] 创建 `apps/stage-tamagotchi/src/renderer/stores/vision.ts`
- [ ] 管理截图状态、加载状态、错误状态
- [ ] 封装 IPC 调用方法

**验收**：Store 可以正常获取截图数据

---

### 任务 1.4：创建手动触发 UI 组件

**描述**：添加用户触发截屏的按钮组件

**子任务**：
- [ ] 创建 `packages/stage-ui/src/components/vision/ScreenCaptureButton.vue`
- [ ] 在 AIRI 对话界面添加触发按钮
- [ ] 添加加载状态和反馈提示

**验收**：用户点击按钮可以触发截屏和分析流程

---

## M2：AI 屏幕分析集成

### 任务 2.1：创建 VisionAnalyzer 服务

**描述**：封装 AI 分析能力

**子任务**：
- [ ] 创建 `packages/stage-ui/src/services/vision-analyzer.ts`
- [ ] 实现 `analyzeScreen(image: Buffer)` 方法
- [ ] 定义 `ScreenAnalysis` 类型（描述、元素列表、坐标）

**验收**：可以获取截图的 AI 分析结果

---

### 任务 2.2：集成 MidsceneJS

**描述**：将 MidsceneJS 作为 AI 分析层

**子任务**：
- [ ] 安装 `midscenejs` 依赖
- [ ] 配置 MidsceneJS 使用 AIRI 的模型系统
- [ ] 实现模型切换逻辑（OpenAI/Ollama）

**验收**：MidsceneJS 可以正常调用 AI 分析截图

---

### 任务 2.3：实现模型切换功能

**描述**：利用 AIRI 现有模型系统实现灵活切换

**子任务**：
- [ ] 创建模型配置接口，集成现有 provider 系统
- [ ] 支持 OpenAI GPT-4o
- [ ] 支持 Claude Sonnet
- [ ] 支持 Ollama 本地模型

**验收**：可以在配置中切换不同 AI 模型

---

### 任务 2.4：显示分析结果

**描述**：在 UI 中展示 AI 分析结果

**子任务**：
- [ ] 创建分析结果展示组件
- [ ] 显示识别的 UI 元素和位置
- [ ] 支持将分析结果作为上下文传给 AIRI

**验收**：用户可以看到截图的 AI 分析内容

---

## M3：桌面控制功能

### 任务 3.1：创建 DesktopController 服务

**描述**：封装桌面控制能力

**子任务**：
- [ ] 创建 `packages/stage-ui/src/services/desktop-controller.ts`
- [ ] 实现 `click(x, y)` 鼠标点击
- [ ] 实现 `type(text)` 键盘输入
- [ ] 实现 `hotkey(keys)` 快捷键

**验收**：可以控制桌面鼠标和键盘

---

### 任务 3.2：集成 nut-js 或 robotjs

**描述**：安装并配置桌面控制库

**子任务**：
- [ ] 在 `apps/stage-tamagotchi/package.json` 添加依赖
- [ ] 在 Main Process 中初始化 nut-js
- [ ] 注册 `vision:execute` IPC 事件

**验收**：可以在 Main Process 中执行桌面操作

---

### 任务 3.3：实现自然语言指令解析

**描述**：利用 AI 解析用户的操作指令

**子任务**：
- [ ] 在 VisionAnalyzer 中添加 `executeAction(action)` 方法
- [ ] 将自然语言转换为具体坐标操作
- [ ] 处理"找不到元素"等异常情况

**验收**：可以说"点击确定按钮"来执行实际操作

---

### 任务 3.4：添加安全确认机制

**描述**：防止误操作，添加操作确认

**子任务**：
- [ ] 在执行危险操作前显示确认对话框
- [ ] 可配置是否启用确认
- [ ] 添加操作日志记录

**验收**：重要操作需要用户确认才执行

---

## M4：自动感知与触发机制

### 任务 4.1：实现屏幕变化检测

**描述**：检测窗口切换、应用切换等事件

**子任务**：
- [ ] 使用 PowerShell 或系统 API 监控活动窗口
- [ ] 检测前台应用变化时触发截屏
- [ ] 在 Main Process 中实现监控逻辑

**验收**：切换窗口时自动触发截屏

---

### 任务 4.2：实现定期自动截屏

**描述**：无变化时定期截屏

**子任务**：
- [ ] 在 VisionService 中实现定时器
- [ ] 支持配置截屏间隔（默认 30 秒）
- [ ] 支持启用/禁用自动截屏

**验收**：定期自动截屏功能正常

---

### 任务 4.3：实现冷却机制

**描述**：防止频繁触发

**子任务**：
- [ ] 实现 cooldown 时间控制（默认 5 秒）
- [ ] 在自动触发和手动触发中都应用冷却
- [ ] 显示冷却状态给用户

**验收**：冷却期间不会重复触发截屏

---

## M5：AIRI 集成

### 任务 5.1：创建 AIRI 视觉上下文

**描述**：将屏幕分析结果整合到 AIRI 对话

**子任务**：
- [ ] 创建屏幕上下文数据结构
- [ ] 将分析结果作为 system prompt 传给 AIRI
- [ ] 支持选择是否共享屏幕上下文

**验收**：AIRI 可以利用屏幕上下文进行对话

---

### 任务 5.2：创建视觉系统设置页面

**描述**：让用户可以配置视觉系统

**子任务**：
- [ ] 在设置页面添加"视觉系统"配置区块
- [ ] 配置项：自动截屏、间隔、冷却、默认模型
- [ ] 保存配置到本地存储

**验收**：用户可以在设置中调整视觉系统参数

---

### 任务 5.3：添加 i18n 翻译

**描述**：国际化支持

**子任务**：
- [ ] 在 `packages/i18n/` 添加视觉相关翻译 key
- [ ] 添加中英文翻译内容
- [ ] 在组件中使用翻译 key

**验收**：界面显示正确的翻译文本

---

## 任务依赖关系

```
M1 (基础)
├── 1.1 VisionService ← M2.1
├── 1.2 IPC 截屏 ← 1.3
├── 1.3 Vision Store ← 1.4, M4
└── 1.4 UI 组件 ← M2.4

M2 (AI 分析) ← M1
├── 2.1 VisionAnalyzer ← 2.2
├── 2.2 MidsceneJS ← 2.3
├── 2.3 模型切换 ← M5.2
└── 2.4 结果展示 ← 5.1

M3 (桌面控制) ← M1
├── 3.1 Controller ← 3.2
├── 3.2 nut-js ← 3.3
├── 3.3 指令解析 ← 3.4
└── 3.4 安全确认

M4 (自动感知) ← M1.3
├── 4.1 变化检测 ← 4.2
├── 4.2 定期截屏 ← 4.3
└── 4.3 冷却机制

M5 (AIRI 集成) ← M2, M3, M4
├── 5.1 视觉上下文 ← M2.4, M4
├── 5.2 设置页面 ← M2.3
└── 5.3 i18n
```

---

## 预估工作量

| 阶段 | 预估任务数 | 复杂度 |
|------|-------------|--------|
| M1 | 4 | 中 |
| M2 | 4 | 高 |
| M3 | 4 | 高 |
| M4 | 3 | 中 |
| M5 | 3 | 中 |
| **总计** | **18** | - |
