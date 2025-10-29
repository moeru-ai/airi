# 表单字段 (Field)

<cite>
**本文档中引用的文件**  
- [FieldInput.vue](file://packages/ui/src/components/Form/Field/FieldInput.vue)
- [FieldSelect.vue](file://packages/ui/src/components/Form/Field/FieldSelect.vue)
- [FieldCheckbox.vue](file://packages/ui/src/components/Form/Field/FieldCheckbox.vue)
- [FieldKeyValues.vue](file://packages/ui/src/components/Form/Field/FieldKeyValues.vue)
- [FieldRange.vue](file://packages/ui/src/components/Form/Field/FieldRange.vue)
- [FieldValues.vue](file://packages/ui/src/components/Form/Field/FieldValues.vue)
</cite>

## 目录
1. [简介](#简介)
2. [核心设计与作用](#核心设计与作用)
3. [Props 详解](#props-详解)
4. [插槽（Slots）用法](#插槽slots-用法)
5. [实际使用示例](#实际使用示例)
6. [视觉样式说明](#视觉样式说明)
7. [与表单验证库的集成](#与表单验证库的集成)
8. [可访问性最佳实践](#可访问性最佳实践)
9. [复杂表单布局中的应用技巧](#复杂表单布局中的应用技巧)
10. [总结](#总结)

## 简介

`Field` 组件是 `stage-ui` 中用于构建结构化表单字段的核心容器组件。它为输入控件（如 Input、Select、Checkbox 等）提供了一致的布局包装，统一管理标签、描述、必填标识和错误提示等 UI 元素，从而提升表单的可读性和用户体验。

**Field** 组件本身不直接渲染输入元素，而是通过组合模式，将具体的输入组件（如 `Input`、`Select`）作为其子组件或默认插槽内容进行封装，形成一个完整的、语义化的表单字段单元。

## 核心设计与作用

`Field` 组件的设计目的是作为表单布局的标准化容器，其主要作用包括：

- **统一布局结构**：为所有表单字段提供一致的垂直布局（标签在上，输入控件在下）。
- **语义化标签管理**：通过 `<label>` 元素正确关联输入控件，增强可访问性。
- **状态可视化**：支持显示必填星号（*）、描述文本和错误信息，清晰传达字段状态。
- **灵活的组合性**：通过插槽机制，允许高度自定义标签、描述和输入内容。

该组件通过多个专用子组件实现不同输入类型的支持，例如 `FieldInput`、`FieldSelect`、`FieldCheckbox` 等，每个子组件都继承了 `Field` 的核心布局和语义特性。

**Section sources**
- [FieldInput.vue](file://packages/ui/src/components/Form/Field/FieldInput.vue#L1-L58)
- [FieldSelect.vue](file://packages/ui/src/components/Form/Field/FieldSelect.vue#L1-L65)
- [FieldCheckbox.vue](file://packages/ui/src/components/Form/Field/FieldCheckbox.vue#L1-L30)

## Props 详解

`Field` 系列组件共享一组核心的 `props`，用于控制字段的外观和行为。

| Prop 名称 | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `label` | `string` | `undefined` | 字段的主标签文本，显示在输入控件上方。 |
| `description` | `string` | `undefined` | 字段的辅助描述文本，以较小的字体显示在标签下方。 |
| `required` | `boolean` | `true` | 是否为必填字段。若为 `true` 或未设置，则显示红色星号（*）标识。 |
| `inputClass` / `selectClass` 等 | `string` \| `string[]` | `undefined` | 传递给内部输入组件的额外 CSS 类，用于自定义样式。 |

例如，在 `FieldInput` 中，`placeholder`、`type` 和 `singleLine` 等 prop 会直接透传给内部的 `Input` 组件。

**Section sources**
- [FieldInput.vue](file://packages/ui/src/components/Form/Field/FieldInput.vue#L3-L15)
- [FieldSelect.vue](file://packages/ui/src/components/Form/Field/FieldSelect.vue#L3-L15)
- [FieldCheckbox.vue](file://packages/ui/src/components/Form/Field/FieldCheckbox.vue#L3-L6)

## 插槽（Slots）用法

`Field` 组件通过插槽提供了强大的内容自定义能力。

| 插槽名称 | 说明 |
|---------|------|
| `default` | 默认插槽，用于放置实际的输入组件（如 `Input`、`Select`）。如果未提供，组件会尝试使用内置的输入组件（如 `FieldInput` 中的 `Input`）。 |
| `label` | 自定义标签内容。可以插入 HTML 或其他组件来丰富标签的显示，例如添加图标或链接。 |
| `description` | 自定义描述内容。与 `label` 插槽类似，可用于插入更复杂的描述信息。 |
| `error` | 用于显示错误信息。虽然在当前代码中未直接实现，但可通过组合或扩展 `Field` 组件来支持此插槽，将错误信息集成到布局中。 |

使用插槽可以实现更复杂的交互，例如在标签旁添加帮助图标，或在描述区域嵌入可展开的详细说明。

**Section sources**
- [FieldInput.vue](file://packages/ui/src/components/Form/Field/FieldInput.vue#L20-L25)
- [FieldSelect.vue](file://packages/ui/src/components/Form/Field/FieldSelect.vue#L27-L32)
- [FieldCheckbox.vue](file://packages/ui/src/components/Form/Field/FieldCheckbox.vue#L18-L23)

## 实际使用示例

以下是如何使用 `Field` 组件包装不同输入控件的代码示例路径：

- **文本输入**：使用 `FieldInput` 组件，通过 `v-model` 双向绑定值，设置 `label` 和 `placeholder`。
  **Section sources**: [FieldInput.vue](file://packages/ui/src/components/Form/Field/FieldInput.vue)

- **选择器**：使用 `FieldSelect` 组件，传入 `options` 数组，并通过 `v-model` 绑定选中值。
  **Section sources**: [FieldSelect.vue](file://packages/ui/src/components/Form/Field/FieldSelect.vue)

- **复选框**：使用 `FieldCheckbox` 组件，其布局为标签和复选框并排显示，适用于布尔值输入。
  **Section sources**: [FieldCheckbox.vue](file://packages/ui/src/components/Form/Field/FieldCheckbox.vue)

- **键值对列表**：使用 `FieldKeyValues` 组件，可以动态添加和删除键值对条目，适用于配置项输入。
  **Section sources**: [FieldKeyValues.vue](file://packages/ui/src/components/Form/Field/FieldKeyValues.vue)

- **范围滑块**：使用 `FieldRange` 组件，显示一个滑块并实时显示当前数值。
  **Section sources**: [FieldRange.vue](file://packages/ui/src/components/Form/Field/FieldRange.vue)

## 视觉样式说明

`Field` 组件采用简洁现代的设计风格：

- **字体**：标签使用 `text-sm font-medium`，描述使用 `text-xs text-neutral-500`。
- **颜色**：遵循深色/浅色主题，描述文本在深色模式下颜色稍亮以保证可读性。
- **布局**：使用 `flex` 布局，确保标签和输入控件垂直对齐，间距适中（`gap-4`）。
- **交互**：输入框有明确的聚焦状态（`border-focus:primary-300`）和禁用状态样式。
- **必填标识**：红色星号（`text-red-500`）清晰标示必填字段。

这些样式通过 UnoCSS 原子化 CSS 框架实现，确保了样式的一致性和高效性。

**Section sources**
- [FieldInput.vue](file://packages/ui/src/components/Form/Field/FieldInput.vue#L20-L55)
- [FieldSelect.vue](file://packages/ui/src/components/Form/Field/FieldSelect.vue#L27-L60)

## 与表单验证库的集成

虽然 `Field` 组件本身不包含验证逻辑，但它与主流 Vue 表单验证库（如 VeeValidate 或 @vuelidate/core）集成非常方便。

集成方法：
1. 在使用 `Field` 的父组件中，使用验证库定义验证规则。
2. 将验证结果（如 `$errors`）传递给 `Field` 组件，可通过 `description` 插槽显示错误信息，或通过 `props` 传递一个 `error` 状态。
3. 根据 `error` 状态动态修改输入框的边框颜色（例如，错误时变为红色）。

通过这种方式，`Field` 组件可以无缝地成为完整表单验证流程的一部分。

## 可访问性最佳实践

`Field` 组件的设计遵循了可访问性（a11y）的最佳实践：

- **语义化标签**：使用 `<label>` 元素包裹，确保屏幕阅读器能正确识别字段。
- **`for`/`id` 关联**：虽然在代码中未显式写出，但 `label` 包裹 `input` 的结构天然建立了关联。
- **对比度**：文本颜色与背景有足够的对比度，确保在不同环境下都可读。
- **键盘导航**：通过 `tabindex` 和正确的元素结构，保证用户可以使用键盘遍历表单。

这些特性使得 `Field` 组件对所有用户，包括残障用户，都更加友好。

## 复杂表单布局中的应用技巧

在构建复杂表单时，可以结合以下技巧使用 `Field` 组件：

- **嵌套布局**：将多个 `Field` 组件放入 `div` 或 `fieldset` 中，并使用 CSS Grid 或 Flexbox 进行分组和对齐。
- **条件渲染**：根据其他字段的值，动态显示或隐藏某些 `Field`。
- **动态字段**：使用 `v-for` 配合 `FieldValues` 或 `FieldKeyValues` 创建可变数量的输入项。
- **分步表单**：在向导式表单中，每个步骤使用一组 `Field` 组件，并在切换步骤时进行验证。

通过这些技巧，`Field` 组件能够适应从简单设置到复杂数据录入的各种场景。

## 总结

`Field` 组件是 `stage-ui` 表单系统的基础构建块。它通过提供一致的布局、清晰的语义和灵活的自定义选项，极大地简化了高质量表单的开发。其基于插槽的设计模式鼓励组合而非继承，使得组件既强大又易于扩展。无论是简单的登录表单还是复杂的数据配置界面，`Field` 组件都能提供坚实可靠的支撑。