# Tabs 布局

<cite>
**Referenced Files in This Document**   
- [Tabs.vue](file://packages/stage-ui/src/components/layouts/Tabs.vue)
</cite>

## 目录
1. [简介](#简介)
2. [核心功能](#核心功能)
3. [属性详解](#属性详解)
4. [事件系统](#事件系统)
5. [插槽机制](#插槽机制)
6. [实际使用示例](#实际使用示例)
7. [键盘导航与可访问性](#键盘导航与可访问性)
8. [缓存策略](#缓存策略)
9. [Vue Router集成](#vue-router集成)
10. [深层嵌套布局使用](#深层嵌套布局使用)

## 简介
Tabs布局组件是一种用于在单个界面中组织和切换不同内容区域的UI控件。该组件通过标签页的形式，允许用户在多个相关但不同的视图之间进行切换，从而提高界面的空间利用率和用户体验。Tabs组件在现代Web应用中广泛应用于设置面板、数据仪表盘、表单向导等场景。

**Section sources**
- [Tabs.vue](file://packages/stage-ui/src/components/layouts/Tabs.vue#L0-L143)

## 核心功能
Tabs组件的核心功能是实现内容区域的切换。它通过维护一个当前激活的标签页状态（modelValue），并根据该状态渲染相应的内容。组件支持动态配置标签页，允许开发者通过props传入标签页数组，每个标签页包含值、标签文本、图标和禁用状态等属性。标签页的切换通过点击事件触发，组件会相应地更新modelValue并重新渲染内容区域。

**Section sources**
- [Tabs.vue](file://packages/stage-ui/src/components/layouts/Tabs.vue#L0-L143)

## 属性详解
Tabs组件提供了丰富的属性来定制其外观和行为：

- **modelValue**: 字符串类型，表示当前激活的标签页的值。这是组件的核心状态，通过v-model双向绑定进行管理。
- **tabs**: TabItem数组类型，定义了所有标签页的配置。每个TabItem包含value（唯一标识）、label（显示文本）、icon（可选图标）和disabled（是否禁用）属性。
- **theme**: 主题变体，支持'primary'、'violet'、'lime'、'orange'四种风格，用于改变组件的整体视觉效果。
- **size**: 尺寸选项，支持'xs'、'sm'、'md'三种大小，适应不同的界面需求。
- **label**: 可选的标签文本，显示在标签页列表上方，用于描述整个Tabs组件的用途。

**Section sources**
- [Tabs.vue](file://packages/stage-ui/src/components/layouts/Tabs.vue#L0-L55)

## 事件系统
Tabs组件通过自定义事件与外部进行通信：

- **update:modelValue**: 当标签页切换时触发，携带新的激活值。这是v-model机制的基础，允许父组件响应标签页变化。
- **change**: 在标签页切换后触发，同样携带新的激活值。与update:modelValue的区别在于，change事件更侧重于表示状态变更的完成。

这两个事件共同构成了组件的事件系统，使得Tabs组件既能作为受控组件使用，也能在需要时提供额外的状态变更通知。

**Section sources**
- [Tabs.vue](file://packages/stage-ui/src/components/layouts/Tabs.vue#L0-L55)

## 插槽机制
Tabs组件采用插槽（slot）机制来实现内容的灵活渲染：

- **默认插槽（default）**: 用于渲染当前激活标签页的内容。插槽暴露了active属性，表示当前激活的标签页值，允许内容根据激活状态进行条件渲染。
- **标签页标题**: 虽然没有显式的标题插槽，但通过tabs数组中的label属性和icon属性，可以自定义每个标签页的标题显示。

这种插槽设计使得组件具有高度的灵活性，内容区域可以包含任意复杂的Vue组件，而不仅仅是静态文本。

**Section sources**
- [Tabs.vue](file://packages/stage-ui/src/components/layouts/Tabs.vue#L95-L142)

## 实际使用示例
以下是一个典型的Tabs组件使用示例：

```vue
<Tabs v-model="activeTab" :tabs="tabList">
  <template #default="{ active }">
    <div v-if="active === 'profile'">用户资料内容</div>
    <div v-else-if="active === 'settings'">设置内容</div>
    <div v-else>帮助内容</div>
  </template>
</Tabs>
```

对于动态标签页，可以通过计算属性或方法生成tabs数组。与Vue Router集成时，可以将路由参数与modelValue绑定，实现URL驱动的标签页切换。

**Section sources**
- [Tabs.vue](file://packages/stage-ui/src/components/layouts/Tabs.vue#L0-L143)

## 键盘导航与可访问性
Tabs组件实现了基本的键盘导航和ARIA可访问性支持：

- 使用`role="tablist"`和`role="tab"`定义了正确的ARIA角色，帮助屏幕阅读器理解组件结构。
- 通过`aria-selected`属性动态指示当前激活的标签页。
- 支持焦点管理，用户可以通过Tab键导航到标签页按钮，并使用Enter或Space键激活。
- 提供了可见的焦点轮廓（focus-visible），确保键盘用户的操作可见性。

这些特性共同确保了组件对残障用户的友好性，符合WCAG可访问性标准。

**Section sources**
- [Tabs.vue](file://packages/stage-ui/src/components/layouts/Tabs.vue#L95-L142)

## 缓存策略
该Tabs组件本身不包含内置的缓存机制。每次标签页切换时，内容区域都会重新渲染。如果需要实现标签页内容的缓存，建议在父组件中使用Vue的`<keep-alive>`组件包裹Tabs组件的内容插槽。这样可以保留非激活标签页的组件状态，避免不必要的重新渲染和数据获取。

**Section sources**
- [Tabs.vue](file://packages/stage-ui/src/components/layouts/Tabs.vue#L95-L142)

## Vue Router集成
虽然Tabs组件本身不直接依赖Vue Router，但可以轻松实现与路由的深度集成：

- 将`modelValue`绑定到路由参数或查询参数，实现URL与标签页状态的同步。
- 使用路由守卫监听路由变化，更新Tabs组件的状态。
- 结合`unplugin-vue-router`等工具，可以在路由元信息中定义标签页配置，实现声明式的路由集成。

这种集成方式使得标签页状态可以被书签保存和分享，提升了应用的用户体验。

**Section sources**
- [Tabs.vue](file://packages/stage-ui/src/components/layouts/Tabs.vue#L0-L143)

## 深层嵌套布局使用
在深层嵌套的布局中使用Tabs组件时，需要注意以下几点：

- 确保主题和样式在嵌套层级中的一致性，避免样式冲突。
- 在复杂的嵌套结构中，合理管理`modelValue`的状态传递，可以使用Vuex或Pinia进行状态管理。
- 注意事件冒泡，必要时使用`.stop`修饰符防止事件意外传播。
- 考虑性能影响，避免在深层嵌套中创建过多的Tabs实例。

通过遵循这些最佳实践，可以在复杂的UI结构中有效使用Tabs组件。

**Section sources**
- [Tabs.vue](file://packages/stage-ui/src/components/layouts/Tabs.vue#L0-L143)