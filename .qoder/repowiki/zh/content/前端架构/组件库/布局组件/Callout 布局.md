# Callout 布局

<cite>
**Referenced Files in This Document**   
- [Callout.vue](file://packages/stage-ui/src/components/layouts/Callout.vue)
- [Callout.story.vue](file://packages/stage-ui/src/components/layouts/Callout.story.vue)
</cite>

## 目录
1. [简介](#简介)
2. [视觉设计与使用场景](#视觉设计与使用场景)
3. [Props 属性](#props-属性)
4. [插槽系统](#插槽系统)
5. [实际使用示例](#实际使用示例)
6. [样式定制](#样式定制)
7. [Markdown 集成](#markdown-集成)
8. [响应式行为](#响应式行为)
9. [可访问性实现](#可访问性实现)
10. [应用模式](#应用模式)

## 简介
Callout 组件是一个用于突出显示重要信息的布局组件，广泛应用于文档、设置页面和其他需要强调特定内容的场景。该组件通过视觉上的区分来吸引用户注意力，帮助用户快速识别关键信息、警告、提示或说明。Callout 组件设计简洁，易于集成，支持多种主题变体和灵活的定制选项。

**Section sources**
- [Callout.vue](file://packages/stage-ui/src/components/layouts/Callout.vue)
- [Callout.story.vue](file://packages/stage-ui/src/components/layouts/Callout.story.vue)

## 视觉设计与使用场景
Callout 组件的视觉设计旨在通过颜色编码和布局结构来区分不同类型的信息。组件左侧有一条垂直的彩色条纹，用于快速识别信息类型，内部包含一个标签区域和主要内容区域。这种设计模式在用户界面中被广泛采用，因为它能够有效地引导用户注意力。

主要使用场景包括：
- **信息提示**：在文档或设置页面中提供有用的提示和建议
- **警告通知**：显示需要用户特别注意的重要警告信息
- **错误说明**：解释错误原因和可能的解决方案
- **成功反馈**：展示操作成功后的确认信息
- **说明文档**：在技术文档中突出显示关键概念或注意事项

**Section sources**
- [Callout.story.vue](file://packages/stage-ui/src/components/layouts/Callout.story.vue#L0-L81)

## Props 属性
Callout 组件提供了简洁而实用的属性系统，允许开发者轻松配置组件的外观和行为。

### type 属性
组件通过 `theme` 属性（而非 `type`）来定义不同的主题变体，支持以下四种预设主题：
- **primary**：主色调，用于一般性的重要信息
- **violet**：紫色调，用于项目相关的说明信息
- **lime**：青绿色调，用于提示和建议
- **orange**：橙色调，用于警告和需要注意的信息

### label 属性
`label` 属性用于设置 Callout 组件的标签文本，显示在内容区域的顶部。当未提供自定义标签插槽时，该属性的值将作为默认标签显示。如果未设置 `label` 属性且未使用标签插槽，则默认显示为 "Callout"。

**Section sources**
- [Callout.vue](file://packages/stage-ui/src/components/layouts/Callout.vue#L1-L77)

## 插槽系统
Callout 组件采用 Vue 的插槽系统提供高度的灵活性和可定制性。

### 默认插槽
默认插槽用于放置 Callout 组件的主要内容。开发者可以将任意 HTML 内容或 Vue 组件放入此插槽，以展示详细的信息、说明文本或其他相关元素。这是组件最常用的插槽，用于显示需要突出显示的主体内容。

### 标题插槽
`label` 插槽允许开发者完全自定义标签区域的内容。通过使用此插槽，可以添加图标、复杂布局或其他交互元素，而不仅仅是简单的文本标签。这为创建更具视觉吸引力和功能性的提示信息提供了可能。

**Section sources**
- [Callout.vue](file://packages/stage-ui/src/components/layouts/Callout.vue#L65-L75)
- [Callout.story.vue](file://packages/stage-ui/src/components/layouts/Callout.story.vue#L68-L80)

## 实际使用示例
以下是 Callout 组件在不同场景下的实际使用示例：

### 基本用法
最简单的用法是直接使用 Callout 组件包裹需要突出显示的内容：
```vue
<Callout>
  <div>
    <div>Primary theme.</div>
    <div>The Project AIRI theme, powered by our Chromatic design system.</div>
  </div>
</Callout>
```

### 主题变体
通过 `theme` 属性使用不同的主题变体：
```vue
<Callout theme="violet">
  <div>AIRI is running pure locally in your browser...</div>
</Callout>
```

### 使用标签属性
使用 `label` 属性添加描述性标签：
```vue
<Callout theme="lime" label="Tips!">
  <div>Do you know that you can use the label prop...</div>
</Callout>
```

### 自定义标签插槽
使用标签插槽创建包含图标的复杂标签：
```vue
<Callout theme="orange">
  <template #label>
    <div flex items-center gap-1 font-normal>
      <div i-solar:danger-circle-bold-duotone text-lg />
      <div text-base>Before deleting data...</div>
    </div>
  </template>
  <div text-base>
    <div>This action cannot be undone...</div>
  </div>
</Callout>
```

**Section sources**
- [Callout.story.vue](file://packages/stage-ui/src/components/layouts/Callout.story.vue#L0-L81)

## 样式定制
Callout 组件的样式通过预定义的主题类实现，这些主题类在组件内部以对象形式定义。每个主题包含 `container` 和 `label` 两个样式数组，分别控制容器的整体样式和标签的文本样式。

组件使用了现代 CSS 技术，包括：
- **Backdrop Blur**：通过 `backdrop-blur-md` 类实现毛玻璃效果，增强视觉层次感
- **CSS 变量和计算**：使用 `calc()` 函数和百分比计算来确定内部装饰条的高度
- **暗色模式支持**：通过 `dark:` 前缀类提供完整的暗色模式适配
- **响应式设计**：基于 Tailwind CSS 的实用类系统实现响应式布局

虽然组件提供了预设主题，但开发者可以通过覆盖 CSS 类或扩展主题配置来实现更深层次的样式定制。

**Section sources**
- [Callout.vue](file://packages/stage-ui/src/components/layouts/Callout.vue#L10-L58)

## Markdown 集成
Callout 组件可以无缝集成到 Markdown 内容中，用于突出显示特定段落或信息块。在实际应用中，可以通过 Markdown 解析器将特定的 Markdown 语法转换为 Callout 组件，或者直接在 Markdown 文件中嵌入 Vue 组件语法（如果使用支持 Vue 的 Markdown 渲染器）。

例如，在文档中使用 Callout 组件来突出显示重要说明：
```markdown
::: callout{theme="lime" label="提示"}
这是一个使用 Callout 组件的 Markdown 示例，用于突出显示重要信息。
:::
```

这种集成方式使得技术文档、用户指南和 API 文档能够更加生动和易于理解。

**Section sources**
- [Callout.story.vue](file://packages/stage-ui/src/components/layouts/Callout.story.vue#L0-L81)

## 响应式行为
Callout 组件具有良好的响应式行为，能够适应不同屏幕尺寸和容器大小。组件的响应式特性主要体现在以下几个方面：

- **弹性布局**：使用 Flexbox 布局确保内容在不同屏幕尺寸下都能合理排列
- **相对单位**：使用相对单位（如 rem、em）而非固定像素值，确保组件在不同缩放级别下保持可读性
- **断点适配**：虽然组件本身没有显式的媒体查询，但其使用的 Tailwind CSS 类系统内置了响应式断点支持
- **内容自适应**：组件高度根据内容自动调整，宽度通常继承父容器的宽度

在移动设备上，Callout 组件会自动调整内边距和字体大小，确保在小屏幕上依然具有良好的可读性和用户体验。

**Section sources**
- [Callout.vue](file://packages/stage-ui/src/components/layouts/Callout.vue#L60-L75)

## 可访问性实现
经过对代码库的分析，当前 Callout 组件在可访问性方面存在改进空间。组件目前没有显式地实现 ARIA（Accessible Rich Internet Applications）标签或角色属性，这可能会影响屏幕阅读器用户的使用体验。

建议的可访问性改进包括：
- 添加适当的 `role` 属性，如 `role="note"`、`role="alert"` 或 `role="status"`，根据内容类型确定
- 为不同主题的 Callout 添加相应的 `aria-label` 或 `aria-labelledby` 属性
- 确保足够的颜色对比度，满足 WCAG 可访问性标准
- 考虑添加 `tabindex` 属性以支持键盘导航
- 为图标添加适当的 `aria-hidden` 属性，避免屏幕阅读器重复读取

虽然组件目前没有实现这些可访问性特性，但其语义化的 HTML 结构和清晰的视觉层次为未来的可访问性增强提供了良好的基础。

**Section sources**
- [Callout.vue](file://packages/stage-ui/src/components/layouts/Callout.vue)
- [Callout.story.vue](file://packages/stage-ui/src/components/layouts/Callout.story.vue)

## 应用模式
Callout 组件在不同上下文中展现出多种应用模式：

### 文档场景
在技术文档或用户指南中，Callout 组件用于突出显示关键概念、注意事项或最佳实践。通常使用 `lime` 主题作为提示，`orange` 主题作为警告。

### 设置页面
在应用程序的设置页面中，Callout 组件用于解释复杂设置的含义、提供安全建议或警告用户某些操作的后果。这种场景下，清晰的视觉区分有助于用户做出明智的决策。

### 错误处理
在错误处理流程中，Callout 组件可以用来显示错误详情、可能的原因和解决方案建议。通过统一的视觉样式，用户能够快速识别错误信息并找到解决方法。

### 引导式体验
在新用户引导或功能介绍中，Callout 组件可以作为引导提示，逐步介绍应用程序的功能和特性。结合动画效果，可以创建更加引人入胜的用户体验。

这些应用模式展示了 Callout 组件的灵活性和实用性，使其成为用户界面设计中的重要工具。

**Section sources**
- [Callout.story.vue](file://packages/stage-ui/src/components/layouts/Callout.story.vue#L0-L81)
- [Callout.vue](file://packages/stage-ui/src/components/layouts/Callout.vue#L1-L77)