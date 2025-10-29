# 输入框 (Input)

<cite>
**Referenced Files in This Document**  
- [Input.vue](file://packages/ui/src/components/Form/Input/Input.vue)
- [index.ts](file://packages/ui/src/components/Form/Input/index.ts)
- [index.ts](file://packages/ui/src/components/Form/index.ts)
</cite>

## 目录
1. [简介](#简介)
2. [核心功能与设计](#核心功能与设计)
3. [属性 (Props) 详解](#属性-props-详解)
4. [事件 (Events) 详解](#事件-events-详解)
5. [插槽 (Slots) 用法](#插槽-slots-用法)
6. [实际代码示例](#实际代码示例)
7. [视觉样式说明](#视觉样式说明)
8. [可访问性支持](#可访问性支持)
9. [表单验证集成](#表单验证集成)
10. [性能优化建议](#性能优化建议)

## 简介
`Input` 组件是 `stage-ui` 库中的基础表单元素，用于创建各种类型的输入框，包括文本、密码、数字等。该组件设计简洁，易于使用，并提供了丰富的自定义选项。

**Section sources**
- [Input.vue](file://packages/ui/src/components/Form/Input/Input.vue)

## 核心功能与设计
`Input` 组件的核心功能是提供一个可双向绑定的输入框，支持多种输入类型。组件通过 `defineProps` 定义了可选的 `type` 属性，并使用 `defineModel` 实现了 `v-model` 的双向绑定。

**Section sources**
- [Input.vue](file://packages/ui/src/components/Form/Input/Input.vue)

## 属性 (Props) 详解
`Input` 组件支持以下属性：

- **type**: 输入框的类型，可选值包括 `text`、`password`、`number` 等。默认值为 `text`。
- **v-model**: 双向绑定的值，用于获取和设置输入框的内容。

**Section sources**
- [Input.vue](file://packages/ui/src/components/Form/Input/Input.vue)

## 事件 (Events) 详解
`Input` 组件原生支持以下事件：

- **input**: 当输入框内容发生变化时触发。
- **change**: 当输入框失去焦点且内容发生变化时触发。
- **focus**: 当输入框获得焦点时触发。
- **blur**: 当输入框失去焦点时触发。

**Section sources**
- [Input.vue](file://packages/ui/src/components/Form/Input/Input.vue)

## 插槽 (Slots) 用法
`Input` 组件目前不支持插槽。如果需要在输入框前后添加内容，可以使用 `Field` 组件或其他布局组件来实现。

**Section sources**
- [Input.vue](file://packages/ui/src/components/Form/Input/Input.vue)

## 实际代码示例
以下是 `Input` 组件的使用示例：

```vue
<template>
  <!-- 文本输入框 -->
  <Input v-model="text" placeholder="请输入文本" />

  <!-- 密码输入框 -->
  <Input v-model="password" type="password" placeholder="请输入密码" />

  <!-- 数字输入框 -->
  <Input v-model="number" type="number" placeholder="请输入数字" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Input from '@ui/components/Form/Input/Input.vue';

const text = ref('');
const password = ref('');
const number = ref<number | null>(null);
</script>
```

**Section sources**
- [Input.vue](file://packages/ui/src/components/Form/Input/Input.vue)
- [index.ts](file://packages/ui/src/components/Form/Input/index.ts)

## 视觉样式说明
`Input` 组件具有以下视觉样式：

- 边框：默认为 `neutral-100`，聚焦时变为 `primary-300`（深色模式下为 `primary-400/50`）。
- 背景：默认为 `neutral-50`，聚焦时保持不变（深色模式下为 `neutral-900`）。
- 文本：默认为正常文本，禁用时为 `neutral-400`（深色模式下为 `neutral-600`）。
- 圆角：`rounded-lg`，提供平滑的圆角效果。
- 内边距：`px-2 py-1`，确保内容有足够的空间。
- 阴影：`shadow-sm`，增加轻微的阴影效果。

**Section sources**
- [Input.vue](file://packages/ui/src/components/Form/Input/Input.vue)

## 可访问性支持
`Input` 组件遵循基本的可访问性原则：

- 使用标准的 `<input>` 元素，确保屏幕阅读器能够正确识别。
- 支持键盘导航和操作。
- 提供清晰的视觉反馈，如聚焦状态的变化。

**Section sources**
- [Input.vue](file://packages/ui/src/components/Form/Input/Input.vue)

## 表单验证集成
`Input` 组件可以轻松集成到各种表单验证库中。由于它支持 `v-model`，可以与 `Vuelidate`、`vee-validate` 等库无缝配合使用。

**Section sources**
- [Input.vue](file://packages/ui/src/components/Form/Input/Input.vue)
- [index.ts](file://packages/ui/src/components/Form/index.ts)

## 性能优化建议
- 避免在 `input` 事件中执行昂贵的操作，可以使用防抖（debounce）技术来优化性能。
- 如果输入框内容不需要实时更新，可以考虑使用 `change` 事件代替 `input` 事件。
- 确保 `v-model` 绑定的变量是响应式的，以避免不必要的重新渲染。

**Section sources**
- [Input.vue](file://packages/ui/src/components/Form/Input/Input.vue)