# AIRI 视觉系统集成 - 检查清单

## M1：基础截屏功能 ✅ 已完成

- [x] Main Process 视觉服务已创建于 `apps/stage-tamagotchi/src/main/services/electron/vision.ts`
- [x] `captureScreen()` 方法返回 Base64 截图数据
- [x] 配置管理已实现（autoCapture、cooldown）
- [x] `desktopCapturer` API 正确获取屏幕截图
- [x] IPC 事件 `vision:capture` / `vision:screenshot` 已注册
- [x] Renderer 可以接收到 Base64 截图数据
- [x] Vision Store 已创建于 `apps/stage-tamagotchi/src/renderer/stores/vision.ts`
- [x] Store 正确管理状态（截图、加载、错误）
- [x] `ScreenCaptureButton.vue` 组件已创建
- [x] 按钮触发截屏和分析流程正常工作
- [x] 加载状态和反馈提示已显示

## M2：AI 屏幕分析集成 ✅ 已完成

- [x] `vision-analyzer.ts` 服务已创建于 `packages/stage-ui/src/services/vision-analyzer.ts`
- [x] `analyzeScreenWithAI()` 方法正常工作
- [x] `VisionAnalysisResult` 类型已定义
- [x] 支持 OpenAI GPT-4o
- [x] 支持 Ollama 本地模型
- [x] 分析结果可以传给 AIRI 作为上下文

## M3：桌面控制功能 ✅ 已完成（基础版）

- [x] IPC 事件 `vision:execute-action` 已注册
- [x] 预留桌面控制接口
- [ ] 完整桌面控制需安装 nut-js（后续可选）

## M4：自动感知与触发机制 ✅ 已完成

- [x] 冷却机制已实现（默认 5 秒）
- [x] 定期自动截屏已实现
- [x] 自动触发可通过 `enableAutoCapture()` 启用

## M5：AIRI 集成 ✅ 已完成

- [x] 视觉状态已集成到 Store
- [x] 分析结果组件已创建 (`VisionAnalysisResult.vue`)
- [x] 可将分析结果作为上下文传给 AIRI

---

## 已创建的文件清单

| # | 文件路径 | 说明 |
|---|----------|------|
| 1 | `apps/stage-tamagotchi/src/shared/vision.ts` | IPC 事件定义 |
| 2 | `apps/stage-tamagotchi/src/main/services/electron/vision.ts` | Main Process 视觉服务 |
| 3 | `apps/stage-tamagotchi/src/main/services/electron/index.ts` | 导出更新 |
| 4 | `apps/stage-tamagotchi/src/main/windows/shared/window.ts` | 注册 VisionService |
| 5 | `apps/stage-tamagotchi/src/renderer/stores/vision.ts` | Renderer 视觉状态管理 |
| 6 | `packages/stage-ui/src/components/scenarios/vision/screen-capture-button.vue` | 触发按钮组件 |
| 7 | `packages/stage-ui/src/components/scenarios/vision/vision-analysis-result.vue` | 分析结果展示组件 |
| 8 | `packages/stage-ui/src/services/vision-analyzer.ts` | AI 分析服务 |
| 9 | `packages/stage-ui/src/services/index.ts` | 服务导出 |
| 10 | `packages/stage-ui/package.json` | 添加 services 导出 |

---

## 使用方式

### 1. 在组件中使用视觉功能

```vue
<script setup lang="ts">
import { useVisionStore } from '@proj-airi/stage-ui/stores/vision'
import { ScreenCaptureButton } from '@proj-airi/stage-ui/components/scenarios/vision'

const visionStore = useVisionStore()
</script>

<template>
  <ScreenCaptureButton
    :is-capturing="visionStore.isCapturing"
    :cooldown-remaining="visionStore.cooldownRemaining"
    @capture="visionStore.captureAndAnalyze"
  />
</template>
```

### 2. 配置 AI 模型

```ts
import { setVisionModelConfig } from '@proj-airi/stage-ui/services/vision-analyzer'

// 使用 Ollama
setVisionModelConfig({
  provider: 'ollama',
  modelName: 'llama3.2-vision',
  baseUrl: 'http://localhost:11434/v1'
})

// 使用 OpenAI
setVisionModelConfig({
  provider: 'openai',
  modelName: 'gpt-4o',
  apiKey: 'your-api-key'
})
```

---

## 后续优化建议

1. **桌面控制**：安装 `nut-js` 实现完整的鼠标/键盘控制
2. **屏幕变化检测**：添加系统级窗口切换监听
3. **设置页面**：添加可视化配置界面
4. **i18n**：添加多语言支持
