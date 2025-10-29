# 多行文本框 (Textarea)

<cite>
**Referenced Files in This Document**  
- [Textarea.vue](file://packages/ui/src/components/Form/Textarea/Textarea.vue)
- [Basic.vue](file://packages/ui/src/components/Form/Textarea/Basic.vue)
- [Textarea.story.vue](file://packages/stage-ui/src/components/form/textarea/Textarea.story.vue)
- [Basic.story.vue](file://packages/stage-ui/src/components/form/textarea/Basic.story.vue)
</cite>

## 目录
1. [简介](#简介)
2. [核心组件分析](#核心组件分析)
3. [属性与事件](#属性与事件)
4. [实际应用示例](#实际应用示例)
5. [视觉样式说明](#视觉样式说明)
6. [可访问性支持](#可访问性支持)
7. [最佳实践](#最佳实践)

## 简介
多行文本框 (Textarea) 组件是 stage-ui 库中的一个核心表单元素，专为处理多行文本输入而设计。该组件在用户评论、内容编辑、消息发送等需要较长文本输入的场景中发挥着重要作用。组件设计注重用户体验，提供了自动高度调整、提交快捷键、文件粘贴处理等实用功能，同时保持了简洁美观的视觉风格。

## 核心组件分析

### 基础实现 (Basic.vue)
Textarea 组件采用分层设计，其核心功能在 `Basic.vue` 文件中实现。该组件通过 `defineModel` 宏创建了双向数据绑定，确保了 v-model 的无缝集成。组件的核心特性包括：

- **自动高度调整**：通过监听输入值的变化，动态调整文本框的高度以适应内容，避免出现滚动条，提供流畅的输入体验。
- **提交事件处理**：拦截 Enter 键（非 Shift+Enter）的默认行为，触发自定义的 'submit' 事件，适用于聊天、评论等需要快速提交的场景。
- **文件粘贴支持**：当用户粘贴文件时，阻止默认粘贴行为，触发 'pasteFile' 事件，允许父组件处理文件上传逻辑。

**Section sources**
- [Basic.vue](file://packages/ui/src/components/Form/Textarea/Basic.vue#L0-L62)

### 样式封装 (Textarea.vue)
`Textarea.vue` 文件对基础组件进行了样式封装，应用了统一的设计系统。它通过 UnoCSS 的原子化 CSS 类名，定义了文本框的边框、背景、阴影、圆角等视觉属性，确保了与项目整体设计语言的一致性。这种分离使得基础逻辑和视觉样式可以独立维护和复用。

**Section sources**
- [Textarea.vue](file://packages/ui/src/components/Form/Textarea/Textarea.vue#L0-L17)

## 属性与事件

### Props
- **v-model**: 双向绑定的文本值，是组件的核心数据接口。
- **defaultHeight**: 当输入内容为空时，文本框的默认高度。
- **其他原生属性**: 组件继承了原生 `<textarea>` 元素的所有属性，如 `placeholder`、`disabled`、`autofocus`、`maxlength`、`rows`、`cols` 等，可以直接使用。

### Events
- **submit**: 当用户按下 Enter 键（非 Shift+Enter）时触发，事件负载为当前输入的完整文本。
- **pasteFile**: 当用户粘贴文件（如图片）时触发，事件负载为包含文件的数组。
- **input**: 原生 input 事件，当输入内容发生变化时触发。
- **change**: 原生 change 事件，在输入框失去焦点且内容发生改变时触发。
- **focus**: 原生 focus 事件，当输入框获得焦点时触发。
- **blur**: 原生 blur 事件，当输入框失去焦点时触发。

**Section sources**
- [Basic.vue](file://packages/ui/src/components/Form/Textarea/Basic.vue#L0-L62)

## 实际应用示例

### 基础用法
最简单的用法是通过 v-model 绑定一个响应式变量。

```vue
<template>
  <Textarea v-model="message" />
</template>

<script setup>
import { ref } from 'vue'
const message = ref('')
</script>
```

**Section sources**
- [Textarea.story.vue](file://packages/stage-ui/src/components/form/textarea/Textarea.story.vue#L0-L21)

### 自动高度调整
组件默认启用了自动高度调整功能。当用户输入文本时，文本框会自动扩展以显示所有内容，无需手动滚动。

```vue
<template>
  <Textarea v-model="content" placeholder="请输入您的想法..." />
</template>
```

### 字数限制
通过原生的 `maxlength` 属性，可以轻松实现字数限制。

```vue
<template>
  <Textarea v-model="tweet" maxlength="280" placeholder="发布您的推文..." />
</template>
```

### 与表单验证系统集成
Textarea 组件可以无缝集成到任何基于 v-model 的表单验证系统中。例如，可以与 Vuelidate 或 Element Plus 的表单组件结合使用。

```vue
<template>
  <form @submit.prevent="handleSubmit">
    <Textarea v-model="comment" :class="{ 'error': v$.comment.$error }" />
    <div v-if="v$.comment.$error" class="error-message">
      {{ v$.comment.$errors[0].$message }}
    </div>
    <button type="submit">提交</button>
  </form>
</template>
```

**Section sources**
- [Basic.vue](file://packages/ui/src/components/Form/Textarea/Basic.vue#L0-L62)
- [Textarea.vue](file://packages/ui/src/components/Form/Textarea/Textarea.vue#L0-L17)

## 视觉样式说明
Textarea 组件的视觉样式由 `Textarea.vue` 文件中的 UnoCSS 类名定义。主要特点包括：
- **边框**: 默认为中性色边框，聚焦时变为醒目的主色调。
- **背景**: 浅色模式下为浅灰色，深色模式下为深灰色，提供良好的对比度。
- **圆角**: 使用 `rounded-lg` 提供适中的圆角。
- **内边距**: `px-2 py-1` 提供舒适的文本与边框间距。
- **阴影**: `shadow-sm` 添加轻微阴影，增加层次感。
- **过渡效果**: `transition="all duration-200 ease-in-out"` 为边框颜色等变化提供平滑的动画效果。

**Section sources**
- [Textarea.vue](file://packages/ui/src/components/Form/Textarea/Textarea.vue#L0-L17)

## 可访问性支持
虽然在当前代码中未显式使用 `aria-*` 属性或 `role`，但组件通过以下方式支持可访问性：
- **原生语义**: 使用标准的 `<textarea>` 元素，天然具备良好的屏幕阅读器支持。
- **键盘导航**: 支持 Tab 键导航和 Enter 键提交，符合用户预期。
- **焦点管理**: 清晰的聚焦状态样式（边框变色）帮助视觉障碍用户识别当前活动元素。
- **与表单字段集成**: 在 `FieldInput.vue` 等组件中，Textarea 被包裹在 `<label>` 标签内，确保了标签与输入框的关联。

**Section sources**
- [Basic.vue](file://packages/ui/src/components/Form/Textarea/Basic.vue#L0-L62)
- [Textarea.vue](file://packages/ui/src/components/Form/Textarea/Textarea.vue#L0-L17)
- [FieldInput.vue](file://packages/ui/src/components/Form/Field/FieldInput.vue#L0-L47)

## 最佳实践

### 用户评论场景
在用户评论场景中，应利用 `submit` 事件实现快速提交。同时，可以结合 `maxlength` 属性限制评论长度，并提供实时字数统计。

### 内容编辑场景
对于内容编辑器，建议禁用 `submit` 事件的默认行为（即按下 Enter 键不提交），让用户可以自由地进行换行。此时，应提供一个明确的“发布”或“保存”按钮。

### 性能考虑
自动高度调整功能使用了 `watch` 和 `requestAnimationFrame`，性能表现良好。但在处理超长文本时，应考虑设置一个最大高度，并在达到该高度后启用滚动条，以避免页面布局的剧烈变化。

### 可访问性增强
为了进一步提升可访问性，建议在使用 Textarea 的组件中，通过 `aria-label` 或与 `<label>` 元素关联来提供明确的上下文信息。

**Section sources**
- [Basic.vue](file://packages/ui/src/components/Form/Textarea/Basic.vue#L0-L62)
- [Textarea.vue](file://packages/ui/src/components/Form/Textarea/Textarea.vue#L0-L17)