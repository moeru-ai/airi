# 复选框 (Checkbox)

<cite>
**本文档中引用的文件**  
- [Checkbox.vue](file://packages/ui/src/components/Form/Checkbox/Checkbox.vue)
- [FieldCheckbox.vue](file://packages/ui/src/components/Form/Field/FieldCheckbox.vue)
- [Checkbox.story.vue](file://packages/stage-ui/src/components/form/checkbox/Checkbox.story.vue)
</cite>

## 目录
1. [介绍](#介绍)
2. [核心功能与设计目的](#核心功能与设计目的)
3. [Props 详解](#props-详解)
4. [事件系统](#事件系统)
5. [插槽用法](#插槽用法)
6. [实际使用示例](#实际使用示例)
7. [与 Field 组件集成](#与-field-组件集成)
8. [视觉样式与主题支持](#视觉样式与主题支持)
9. [可访问性支持 (ARIA)](#可访问性支持-aria)
10. [表单验证中的应用](#表单验证中的应用)
11. [最佳实践](#最佳实践)

## 介绍

复选框（Checkbox）是用户界面中用于二元选择的核心表单控件，允许用户在“选中”与“未选中”状态之间切换。在 `stage-ui` 组件库中，复选框设计简洁、语义清晰，支持响应式交互、主题定制和无障碍访问。

**Section sources**
- [Checkbox.vue](file://packages/ui/src/components/Form/Checkbox/Checkbox.vue#L1-L27)

## 核心功能与设计目的

`Checkbox` 组件旨在提供一个轻量级、可组合且语义正确的布尔值输入控件。其主要设计目标包括：

- 支持双向数据绑定（v-model）
- 提供一致的视觉反馈和交互体验
- 易于与其他表单组件（如 `Field`）集成
- 遵循无障碍标准（ARIA）

该组件基于 `reka-ui` 的开关根元素（SwitchRoot）构建，但以复选框语义进行封装，确保语义化 HTML 输出。

**Section sources**
- [Checkbox.vue](file://packages/ui/src/components/Form/Checkbox/Checkbox.vue#L1-L10)

## Props 详解

| 属性名 | 类型 | 是否必填 | 说明 |
|--------|------|----------|------|
| `v-model` | `boolean` | 是 | 控制复选框的选中状态，支持双向绑定 |
| `disabled` | `boolean` | 否 | 当设置为 `true` 时，禁用复选框交互 |
| `indeterminate` | `boolean` | 否 | 设置半选状态（视觉上呈现为横线），不影响 `v-model` 值 |

> 注意：`indeterminate` 状态需通过原生 DOM 操作或指令控制，Vue 模板中可通过 `ref` 访问元素并设置 `indeterminate` 属性。

**Section sources**
- [Checkbox.vue](file://packages/ui/src/components/Form/Checkbox/Checkbox.vue#L3)

## 事件系统

| 事件名 | 参数 | 触发时机 |
|--------|------|----------|
| `change` | `(event: Event)` | 当复选框状态改变时触发（用户点击或键盘操作） |

此事件可用于在状态变更时执行副作用逻辑，例如日志记录或表单验证触发。

**Section sources**
- [Checkbox.vue](file://packages/ui/src/components/Form/Checkbox/Checkbox.vue#L1-L27)

## 插槽用法

`Checkbox` 组件本身不提供具名插槽，但可通过外部标签或布局组件实现自定义内容集成。例如，在 `FieldCheckbox` 中通过插槽注入标签和描述。

## 实际使用示例

### 基础用法
```vue
<Checkbox v-model="isChecked" />
```

### 禁用状态
```vue
<Checkbox v-model="isChecked" disabled />
```

### 半选状态（需结合 JavaScript）
```vue
<template>
  <Checkbox ref="checkboxRef" v-model="isChecked" />
</template>

<script setup>
import { ref, onMounted } from 'vue'
const checkboxRef = ref(null)
const isChecked = ref(false)

onMounted(() => {
  checkboxRef.value.$el.indeterminate = true
})
</script>
```

### 交互式状态显示
```vue
<div class="flex items-center gap-4">
  <Checkbox v-model="interactiveValue" />
  <span>当前值: {{ interactiveValue ? '开启' : '关闭' }}</span>
</div>
```

**Section sources**
- [Checkbox.story.vue](file://packages/stage-ui/src/components/form/checkbox/Checkbox.story.vue#L10-L70)

## 与 Field 组件集成

`FieldCheckbox` 是一个组合组件，将 `Checkbox` 与标签、描述封装在一起，适用于标准表单布局。

```vue
<FieldCheckbox
  v-model="form.agreeToTerms"
  label="同意服务条款"
  description="请阅读并接受我们的隐私政策和服务协议"
/>
```

该组件利用 `defineModel` 实现 `v-model` 的透传，并通过插槽支持自定义标签和描述内容。

**Section sources**
- [FieldCheckbox.vue](file://packages/ui/src/components/Form/Field/FieldCheckbox.vue#L1-L30)

## 视觉样式与主题支持

复选框采用 Tailwind CSS 类进行样式定义，支持深色模式和主题颜色定制：

- 使用 `primary-400` 作为选中状态背景色
- 深色模式下自动切换至暗色调边框和背景
- 动画过渡效果（250ms 缓动）提升用户体验
- 圆角滑块设计，符合现代 UI 审美

尺寸固定为高度 28px，宽度 50px，滑块直径 24px。

**Section sources**
- [Checkbox.vue](file://packages/ui/src/components/Form/Checkbox/Checkbox.vue#L12-L26)

## 可访问性支持 (ARIA)

尽管组件使用 `SwitchRoot` 实现，但应确保其在语义上表现为复选框。建议在使用时包裹 `<label>` 元素或通过 `aria-label` 提供上下文。

推荐用法：
```vue
<label class="flex items-center gap-2">
  <Checkbox v-model="accept" />
  <span>我接受隐私政策</span>
</label>
```

这将确保屏幕阅读器正确识别控件用途，并支持键盘导航（Tab 切换，Space 触发）。

**Section sources**
- [Checkbox.vue](file://packages/ui/src/components/Form/Checkbox/Checkbox.vue#L1-L27)

## 表单验证中的应用

`Checkbox` 可无缝集成至各类表单验证方案（如 VeeValidate 或基于 Composition API 的自定义验证逻辑）：

```vue
<template>
  <div>
    <FieldCheckbox v-model="agree" label="同意条款" />
    <p v-if="!agree && submitted" class="text-red-500">必须同意条款才能提交</p>
  </div>
</template>
```

结合 `Field` 组件可实现统一的错误提示样式和布局。

**Section sources**
- [FieldCheckbox.vue](file://packages/ui/src/components/Form/Field/FieldCheckbox.vue#L1-L30)

## 最佳实践

1. **始终关联标签**：使用 `<label>` 包裹或 `aria-label` 确保可访问性
2. **避免孤立使用**：在表单中优先使用 `FieldCheckbox` 以保持一致性
3. **谨慎使用半选状态**：仅在树形选择或多选组中表示部分选中时使用
4. **状态管理清晰**：`v-model` 应绑定布尔值，避免 `null` 或 `undefined`
5. **响应式设计**：确保在移动设备上有足够的点击区域

通过遵循这些实践，可确保复选框组件在各种场景下均具备良好的可用性和可维护性。

**Section sources**
- [Checkbox.vue](file://packages/ui/src/components/Form/Checkbox/Checkbox.vue#L1-L27)
- [FieldCheckbox.vue](file://packages/ui/src/components/Form/Field/FieldCheckbox.vue#L1-L30)