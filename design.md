# AIRI 设计规范

本文从 `packages/ui` 的当前实现整理设计语言，供页面设计、组件开发和评审使用。

范围包括 `stage-web`、`stage-tamagotchi` 和 `stage-pocket` 使用的共享控件。业务布局由 `stage-ui`、`stage-layouts` 和 `stage-pages` 负责。

本文描述源码事实与复用规则，不代表全站已完成视觉或可访问性验收。尚未统一的部分列在「已知差异」中。

## 1. 设计语言

当前 UI 的共同特征是中性色表面、可变主色、圆角、半透明材质，以及可见的交互反馈。

| 特征 | 当前实现 | 复用规则 |
| --- | --- | --- |
| 颜色与强调分离 | `Button.color` 选择色系，`variant` 选择强调程度 | 不把主操作固定成某一种颜色 |
| 中性色承载内容 | 输入框、抽屉和选择器使用 `neutral` 色阶 | 正文与背景沿用组件配对 |
| 圆角按控件区分 | 常规控件 `rounded-lg`，浮层有更大圆角 | 使用组件已有形状，不统一覆盖为一个圆角 |
| 实体按钮用轮廓反馈 | `Button` 无边框，悬停和键盘焦点使用外扩 outline | 保留轮廓空间，避免容器裁切 |
| 输入控件用边框反馈 | `Input`、`Textarea` 和 `Select` 使用 2px 边框 | 不套用按钮的无边框样式 |
| 浮层使用透明材质 | `OverlayButton`、部分按钮与提示使用背景模糊 | 在实际背景上检查文字与控件 |
| 动效跟随交互 | 按下缩放、选中着色、面板展开与关闭 | 复用已有行为，避免页面重复实现 |

具体属性、事件和插槽见[组件参考](./docs/ai/context/ui-components.md)。本文聚焦视觉选择和组件使用边界。

## 2. 主题、颜色与字体

### 主题来源

- [UnoCSS 配置](./uno.config.ts)提供 Chromatic 色阶、字体、图标和公共动画。
- [UI 基础变量](./packages/ui/src/fallback.css)提供 `--chromatic-hue` 与各级色度变量。
- [主题设置](./packages/stage-ui/src/stores/settings/theme.ts)保存用户选择的色相，默认值为 `220.44`。
- [UI 样式入口](./packages/ui/src/main.css)汇总基础变量、灯光动画和组件样式。

`primary` 跟随主题色相，`complementary` 由主题配置提供。产品页面使用已有色阶，不复制一组固定品牌色值。

`neutral` 承载常规表面和文字。浅色与深色分别定义背景、文字、边框和透明度，不能只反转背景。

按钮也支持红、橙、绿等独立色系。`Callout` 仅提供 `primary`、`violet`、`lime`、`orange`，没有统一的成功或错误语义 API。

业务状态必须同时用文案或图标说明，不能假定某个色名自动代表某种状态。

### 字体与文字层级

`uno.config.ts` 定义 `sans`、`sans-rounded`、`cute` 等字体族。控件主要继承宿主字体，不在每个组件里另设字体。

| 已有使用位置 | 当前样式 |
| --- | --- |
| 小按钮 | `text-xs` |
| 常规按钮、输入框、选择器 | `text-sm` |
| 大按钮 | `text-base` |
| `FieldInput` 标签 | `text-sm font-medium` |
| `FieldInput` 说明 | `text-xs`，浅色 `neutral-500`，深色 `neutral-400` |
| `BottomDrawer` 标题 | `text-xl font-semibold tracking-tight` |

这些是控件现状，不构成全站标题字号表。页面标题与正文优先沿用所在布局和相邻页面。

## 3. 按钮体系

### 根据用途选择

| 组件 | 外观与行为 | 使用场景 |
| --- | --- | --- |
| [BasicButton](./packages/ui/src/components/misc/basic-button.vue) | 提供尺寸、图标、加载、禁用和按下反馈，不定义表面与形状 | 构建新的共享按钮外观 |
| [Button](./packages/ui/src/components/misc/button.vue) | 实色或柔和表面，无边框，默认开启悬停与焦点轮廓 | 明确的主要或次要操作 |
| [GhostButton](./packages/ui/src/components/misc/ghost-button.vue) | 默认透明，交互时使用浅主色表面，键盘焦点显示轮廓 | 工具栏和低强调操作 |
| [IconButton](./packages/ui/src/components/misc/icon-button.vue) | 去掉内边距，不内置背景、形状或固定方形尺寸 | 收藏、复制、重试等图标操作 |
| [OverlayButton](./packages/ui/src/components/misc/overlay-button.vue) | 半透明中性表面、背景模糊、`rounded-xl` | 舞台上的悬浮操作 |

`Button` 默认值为 `color="neutral"`、`variant="secondary"`、`shape="rect"`、`size="md"`、`outline=true`。

主要操作显式选择 `variant="primary"`。需要跟随用户主题时，选择 `color="primary"`。

`GhostButton.active` 保留选中表面。切换控件的可访问状态由调用方提供，例如 `aria-pressed`。

### 尺寸与形状

以下尺寸来自 `BasicButton` 与 `Button`，不是新设的 token。px 换算以根字号 16px 为例。

| 尺寸 | BasicButton 内边距 | 字号 | Button 圆形尺寸 |
| --- | --- | --- | --- |
| `sm` | `px-3 py-1.5`，12 × 6px | `text-xs` | `h-8 w-8`，32 × 32px |
| `md` | `px-4 py-2`，16 × 8px | `text-sm` | `h-10 w-10`，40 × 40px |
| `lg` | `px-5 py-3`，20 × 12px | `text-base` | `h-12 w-12`，48 × 48px |
| `unset` | 不提供预设内边距与字号 | 调用方决定 | 调用方决定 |

`GhostButton` 有独立的紧凑尺寸：`sm`、`md`、`lg` 的最小高度分别为 `min-h-7`、`min-h-8`、`min-h-10`。

| Button 形状 | 当前实现 |
| --- | --- |
| `rect` | `rounded-lg` |
| `rounded` | `rounded-full` |
| `circle` | `rounded-full`，移除内边距，应用对应方形尺寸 |
| `parallelogram` | `rounded-lg`，外层倾斜 -10°，内容反向倾斜 10° |

### 状态与调用方责任

- `BasicButton` 使用 200ms 过渡和 `active:scale-95` 按下反馈。
- `loading` 显示 spinner 并禁用按钮，防止重复点击。
- 禁用态使用 50% 透明度，并取消按下缩放。
- `Button` 的轮廓宽度为 2px，悬停与键盘焦点的偏移为 2px。
- `IconButton` 的可访问名称、点击区域和焦点表现需要逐项检查。
- `OverlayButton` 没有自定义 outline，不能据此宣称已满足所有焦点场景。
- 不为普通按钮关闭 `outline`，除非已经提供等价的可见焦点。

按钮字号和内边距不等于触控尺寸保证。移动端必须检查最终可点击区域。

## 4. 表单体系

| 组件 | 当前视觉约定 | 使用边界 |
| --- | --- | --- |
| [Input](./packages/ui/src/components/form/input/input.vue) | `rounded-lg`、`px-2 py-1`、`text-sm`、2px 边框、`shadow-sm` | 单行文字和数字输入 |
| [Textarea](./packages/ui/src/components/form/textarea/textarea.vue) | 沿用 Input 的基础表面、文字与边框 | 多行输入 |
| [FieldInput](./packages/ui/src/components/form/field/field-input.vue) | 标签与说明在前，控件在后，外层 `gap-4` | 带说明的表单字段 |
| [Select](./packages/ui/src/components/form/select/select.vue) | 触发器 `h-9`，默认 `rounded-lg`，弹出内容 `rounded-xl` | 已知选项的单选 |
| [Checkbox](./packages/ui/src/components/form/checkbox/checkbox.vue) | `h-7 w-12.5` 胶囊轨道、`size-6` 滑块 | 布尔开关，底层实际使用 Reka Switch |

输入框的浅色背景为 `neutral-50`，深色背景为 `neutral-950`。聚焦边框使用 `primary-300` 与深色的 `primary-400/50`。

`Input` 当前的 `primary` 与 `secondary` 外观相同。`primary-dimmed` 使用更深的中性表面，并移除该组件中的阴影类。

`Select` 的 `shape="rounded"` 提供胶囊形状，`variant="blurry"` 提供半透明表面。不要把这些属性复制成页面局部样式。

优先使用对应的 `Field*` 组件组织标签与说明。错误关联、提交结果和异步校验仍由业务表单负责。

## 5. 浮层、提示与滑动操作

### BottomDrawer

[BottomDrawer](./packages/ui/src/components/layouts/bottom-drawer.vue)基于 Vaul Vue，统一移动端面板的结构与交互。

- 顶部圆角固定为 32px，最大宽度为 `max-w-lg`，最大高度为 `90dvh`。
- `minimumHeight="half"` 提供 `50dvh` 最小高度，默认按内容确定高度。
- 遮罩使用 `bg-black/35`，遮罩和内容使用 `z-[9999]`。
- 内容使用 `neutral-50`，深色使用 `neutral-900`，并带 `shadow-xl`。
- 水平内边距为 `px-5`，底部内边距兼顾 1rem 与安全区。
- 只有拖动手柄启动拖拽，内容滚动和操作按钮保留原生输入行为。
- 提供可见标题与内部滚动区，不内置关闭按钮。
- 连续打开其他模态内容时，使用 `afterClose` 与 `closeAutoFocus` 协调焦点。

`Select` 弹出内容使用 `z-[10010]`。这些值是当前组件实现，不是完整的全局层级 token 表。

### Callout 与 SwipeActions

[Callout](./packages/ui/src/components/misc/callout.vue)通过浅色表面、左侧竖向色条和强调标题表达提示。调用方提供明确标题与正文。

[SwipeActions](./packages/ui/src/components/swipe-actions/index.ts)负责滑动区域与手势。[SwipeActionButton](./packages/ui/src/components/misc/swipe-action-button.vue)负责胶囊表面、图标与文字。

滑动操作的内容区域使用不透明背景。隐藏可见标签时，仍保留可访问名称。业务层负责撤销、删除和数据状态。

## 6. 动效与图标

| 实现 | 当前动效 |
| --- | --- |
| `BasicButton`、`Input`、`Textarea` | 200ms，`ease-in-out` |
| `Checkbox` 滑块 | 250ms 位移，`ease-in-out` |
| [TransitionVertical](./packages/ui/src/components/animations/transition-vertical.vue) | 默认 250ms，高度与透明度变化 |
| [TransitionHorizontal](./packages/ui/src/components/animations/transition-horizontal.vue) | 500ms，宽度与透明度变化 |
| [AnimatedContent](./packages/ui/src/components/animations/animated-content.vue) | 打开 220ms，关闭 160ms，内层 6px 模糊变化 |
| UnoCSS 公共动画 | 遮罩 300ms，内容 150ms，方向性滑入 400ms，淡入淡出 200ms |

`AnimatedContent` 只负责动画，不提供表面样式。外部生命周期拥有者设置 `data-state`，并保留节点直到关闭动画结束。

`AnimatedContent` 与 `BottomDrawer` 已显式处理减少动态效果偏好。其他控件必须按实际实现检查，不能推断全库一致。

图标使用 Iconify。现有组件和展示用例使用 Solar、Phosphor 等集合，不存在唯一图标集要求。

`BasicButton` 的图标容器为 16 × 16px，spinner 使用同一区域。同一操作组保持视觉尺寸和图标风格一致。

## 7. 已知差异与后续统一顺序

以下是源码检查结果，不在本文中改动运行时代码。

| 差异 | 证据 | 后续处理 |
| --- | --- | --- |
| Input 声明尺寸但未用于样式 | `input.vue` 声明 `size`，模板仅使用 variant 样式 | 先确定尺寸契约，再同步组件、参考文档和展示用例 |
| Input 的两种 variant 外观相同 | `primary` 与 `secondary` 样式数组相同 | 明确是否保留两个名称，不让页面自行制造差异 |
| 焦点样式不完全一致 | Button 与 GhostButton 有显式焦点轮廓，IconButton 与 OverlayButton 未定义同样规则 | 在键盘操作场景中检查，再决定共享修正 |
| 主题过渡规则与实现有差异 | [useTheme](./packages/ui/src/composables/use-theme.ts)设为 `disableTransition: true`，仓库规则要求直接调用 useDark 时设为 false | 页面优先复用入口，集中确认过渡策略 |
| 动效时长与减少动态效果支持分散 | 本文动效表中的实现各自定义参数 | 按交互类型整理，避免直接替换全部时长 |
| 全局视觉 token 尚不完整 | 颜色有公共变量，圆角、间距和层级仍主要在组件内定义 | 从重复的真实需求提取，不先造一套未接入的 token |

优先处理键盘焦点和字段尺寸契约。随后统一重复的视觉参数，再检查业务页面。每项运行时改动单独提供行为与视觉证据。

## 8. 设计工作流与现有 skills

当前仓库已有覆盖实现、检查和截图的 skills。本任务不需要安装另一套视觉风格规范。

| 工作 | 使用入口 | 作用 |
| --- | --- | --- |
| 选择视觉与组件 | 本文、[组件参考](./docs/ai/context/ui-components.md) | 确认 AIRI 现有设计语言与 API |
| 编写组件样式 | [enforce-rules-for-unocss](./.agents/skills/enforce-rules-for-unocss/SKILL.md) | 复用控件、组织工具类、保持主题行为 |
| 编写 Vue 组件 | [vue-best-practices](./.agents/skills/vue-best-practices/SKILL.md)、[TypeScript 规则](./.agents/skills/enforce-rules-for-typescript/SKILL.md) | 约束组件边界、状态与实现方式 |
| 检查交互与可访问性 | [web-design-guidelines](./.agents/skills/web-design-guidelines/SKILL.md) | 作为检查清单，不替代 AIRI 的视觉规则 |
| 获取视觉证据 | [use-vishot](./.agents/skills/use-vishot/SKILL.md) | 使用对应运行端的场景生成截图 |
| 发布 UI PR | [create-pr](./.agents/skills/create-pr/SKILL.md) | 检查影响面，提供同场景的前后截图 |

这些 skills 的入口和职责已经存在。本文不修改 agent 配置，也不声明这些入口已经自动引用本文。

### 每次设计改动

1. 找到对应 UI 控件和已有业务页面，确认差异属于控件还是场景。
2. 先选择已有 variant、size 和 shape，再判断是否需要扩展。
3. 需要扩展共享组件时，同步更新组件参考与展示用例。
4. 检查浅色、深色、自定义主色、长文案、加载和禁用状态。
5. 检查键盘焦点、触控区域、软键盘和安全区。
6. 按 PR 流程记录检查结果与未验证项。

组件预览使用 `pnpm dev:ui`，入口位于 `packages/stage-ui` 的 Histoire。

可先查看[按钮用例](./packages/stage-ui/src/components/misc/button.story.vue)、[输入框用例](./packages/stage-ui/src/components/form/input/input.story.vue)、[选择器用例](./packages/stage-ui/src/components/form/select/select.story.vue)和[滑动操作用例](./packages/stage-ui/src/components/misc/swipe-actions.story.vue)。

文档改动检查链接和格式。实际 UI 改动还需要类型检查、相关测试及视觉验收。源码检查不能替代运行时检查。
