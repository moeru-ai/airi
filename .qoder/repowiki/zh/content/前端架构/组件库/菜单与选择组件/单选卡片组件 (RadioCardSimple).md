# 单选卡片组件 (RadioCardSimple)

<cite>
**本文档引用的文件**
- [RadioCardSimple.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.vue)
- [RadioCardManySelect.vue](file://packages/stage-ui/src/components/menu/RadioCardManySelect.vue)
- [RadioCardSimple.story.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.story.vue)
- [RadioCardDetail.vue](file://packages/stage-ui/src/components/menu/RadioCardDetail.vue)
- [RadioCardDetail.story.vue](file://packages/stage-ui/src/components/menu/RadioCardDetail.story.vue)
</cite>

## 目录
1. [简介](#简介)
2. [核心功能与应用场景](#核心功能与应用场景)
3. [Props 属性详解](#props-属性详解)
4. [事件与双向绑定机制](#事件与双向绑定机制)
5. [选中状态视觉反馈](#选中状态视觉反馈)
6. [无障碍支持](#无障碍支持)
7. [与 RadioCardManySelect 的差异对比](#与-radiocardmanyselect-的差异对比)
8. [表单集成方法](#表单集成方法)
9. [复杂表单中的使用注意事项](#复杂表单中的使用注意事项)
10. [实际代码示例](#实际代码示例)

## 简介

`RadioCardSimple` 是一个用于单选选项组的卡片式选择组件，提供直观的视觉反馈和良好的用户体验。该组件通过卡片形式展示选项，适用于模型选择、设置选项等场景。其设计简洁，支持主题切换，并具备无障碍访问能力。

**Section sources**
- [RadioCardSimple.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.vue#L1-L115)

## 核心功能与应用场景

`RadioCardSimple` 组件主要用于在一组互斥选项中进行单选操作。每个选项以卡片形式呈现，用户点击卡片即可选中对应选项。典型应用场景包括：
- 模型选择界面（如 AI 模型切换）
- 设置选项配置（如主题、语言选择）
- 表单中的单选题回答

该组件通过 `v-model` 实现双向数据绑定，确保视图与数据同步更新。

**Section sources**
- [RadioCardSimple.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.vue#L1-L115)

## Props 属性详解

| 属性 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `id` | `string` | 是 | 卡片的唯一标识符，用于 DOM 元素的 key 值 |
| `name` | `string` | 是 | 单选组的名称，用于表单提交时的字段名 |
| `value` | `string` | 是 | 该选项的值，当选中时会传递给 `v-model` |
| `title` | `string` | 是 | 卡片显示的主标题 |
| `description` | `string` | 否 | 卡片显示的描述文本，位于标题下方 |

这些属性共同定义了卡片的基本信息和行为，确保组件在不同上下文中的一致性。

**Section sources**
- [RadioCardSimple.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.vue#L1-L10)

## 事件与双向绑定机制

`RadioCardSimple` 组件通过 `defineModel` 实现双向绑定，支持 `v-model` 指令。当用户点击卡片时，内部的隐藏 `input[type="radio"]` 会被触发，从而更新绑定的 `modelValue`。

组件会自动发出 `update:modelValue` 事件，携带选中项的 `value` 值。父组件通过 `v-model` 接收该值并更新状态，形成完整的双向绑定闭环。

**Section sources**
- [RadioCardSimple.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.vue#L12-L13)

## 选中状态视觉反馈

组件通过 CSS 类动态切换来提供清晰的选中状态反馈：
- **背景色**：选中项背景色为 `bg-primary-50`（浅色主题）或 `dark:bg-primary-900/20`（深色主题）
- **边框色**：选中项边框为 `border-primary-100`，悬停时增强为 `hover:border-primary-500/30`
- **圆点指示器**：内部的 `.radio-dot` 在选中时 `opacity` 从 0 变为 100，并显示为主色调
- **渐变叠加**：选中或悬停时，卡片会显示从左到右的主色渐变层，增强交互感

这些视觉变化通过 `transition="all duration-200 ease-in-out"` 实现平滑动画效果。

**Section sources**
- [RadioCardSimple.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.vue#L14-L42)
- [RadioCardSimple.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.vue#L76-L113)

## 无障碍支持

`RadioCardSimple` 组件具备良好的无障碍支持：
- 使用语义化的 `<label>` 包裹整个卡片，关联内部的 `<input type="radio">`
- 隐藏的单选按钮仍可被键盘导航访问（通过 `tabindex`）
- 支持键盘操作：用户可通过 Tab 键导航到卡片，按 Space 或 Enter 键选中
- 提供足够的点击区域（`cursor-pointer` 和 `p-4` 内边距）
- 颜色对比度符合无障碍标准，确保在不同主题下均可读

**Section sources**
- [RadioCardSimple.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.vue#L30-L42)

## 与 RadioCardManySelect 的差异对比

| 特性 | `RadioCardSimple` | `RadioCardManySelect` |
|------|-------------------|------------------------|
| **用途** | 单个单选卡片 | 多个可选项的容器组件 |
| **选择模式** | 单选 | 单选（内部管理多个 `RadioCardDetail`） |
| **搜索功能** | 无 | 支持搜索过滤选项 |
| **可扩展性** | 固定内容 | 支持展开/收起长描述 |
| **自定义输入** | 不支持 | 支持为特定选项添加自定义输入框 |
| **布局** | 独立使用 | 通常作为选项容器，水平滚动布局 |
| **复杂度** | 简单 | 复杂，包含状态管理、过滤逻辑 |

`RadioCardManySelect` 实际上是 `RadioCardDetail` 的容器，而 `RadioCardSimple` 是最基础的单选卡片实现。

**Section sources**
- [RadioCardSimple.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.vue#L1-L115)
- [RadioCardManySelect.vue](file://packages/stage-ui/src/components/menu/RadioCardManySelect.vue#L1-L176)
- [RadioCardDetail.vue](file://packages/stage-ui/src/components/menu/RadioCardDetail.vue#L1-L187)

## 表单集成方法

`RadioCardSimple` 可轻松集成到表单中：
1. 将多个 `RadioCardSimple` 组件放入同一 `name` 属性的组中
2. 使用 `v-model` 绑定一个响应式变量来跟踪选中值
3. 在表单提交时，该变量的值将作为选中项的 `value` 被提交
4. 可通过 `id` 和 `title` 属性为每个选项提供唯一标识和显示文本

由于组件基于原生 `input[type="radio"]`，因此与标准 HTML 表单完全兼容。

**Section sources**
- [RadioCardSimple.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.vue#L30-L35)

## 复杂表单中的使用注意事项

在复杂表单中使用 `RadioCardSimple` 时需注意：
- **唯一性**：确保同一表单中所有单选组的 `name` 属性唯一，避免选项冲突
- **初始值**：为 `v-model` 提供合理的初始值，防止出现未选中状态
- **响应式更新**：当动态生成选项时，确保 `value` 值的响应式更新能正确触发视图变化
- **性能**：若选项数量庞大，建议使用虚拟滚动或分页，避免一次性渲染过多 DOM 节点
- **状态管理**：在大型应用中，考虑将选中状态提升到 Vuex/Pinia 等状态管理库中统一管理
- **验证**：配合表单验证库时，需确保能正确捕获 `RadioCardSimple` 的值变化事件

**Section sources**
- [RadioCardSimple.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.vue#L1-L115)

## 实际代码示例

以下是如何使用 `RadioCardSimple` 构建模型选择界面的示例：

```vue
<template>
  <div class="model-selection">
    <h3>选择 AI 模型</h3>
    <div flex="~ wrap gap-4" p-4>
      <RadioCardSimple
        v-for="model in models"
        :key="model.value"
        :id="`model-${model.value}`"
        v-model="selectedModel"
        :name="'ai-model'"
        :value="model.value"
        :title="model.title"
        :description="model.description"
      />
    </div>
    <p>当前选中: {{ selectedModel }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import RadioCardSimple from '@proj-airi/stage-ui/components/menu/RadioCardSimple.vue'

const selectedModel = ref('seraphina')

const models = [
  {
    value: 'seraphina',
    title: 'Seraphina',
    description: '通用对话模型，擅长自然语言理解'
  },
  {
    value: 'neuri',
    title: 'Neuri',
    description: '专业分析模型，擅长数据分析与推理'
  },
  {
    value: 'astra',
    title: 'Astra',
    description: '创意生成模型，擅长内容创作与艺术生成'
  }
]
</script>
```

此示例展示了如何创建一个模型选择界面，用户可直观地从多个卡片中选择一个 AI 模型。

**Section sources**
- [RadioCardSimple.story.vue](file://packages/stage-ui/src/components/menu/RadioCardSimple.story.vue#L1-L64)