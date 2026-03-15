---
title: DevLog @ 2025.08.05
description: |
  v0.7 版本发布。Windows 现已完全支持，包含更多功能。
date: 2025-08-04
excerpt: 抱歉让大家久等了！<br/> v0.7 原本计划在七月初发布，但由于我们在 Windows 上发现了几个关键 bug，以及需要做更多适配工作，所以推迟到了现在。
preview-cover:
  light: "@assets('./assets/cover-light.avif')"
  dark: "@assets('./assets/cover-dark.avif')"
---

<script setup lang="ts">
import Button from '../../../../.vitepress/components/Button.vue'

function handleOpenLatest() {
  window.open('https://github.com/moeru-ai/airi/releases/latest', '_blank')
}
</script>

大家好！这里是 [Neko](https://github.com/nekomeowww)。

抱歉让大家久等了！v0.7 原本计划在七月初发布，
但由于几个让我们彻夜难眠的 Windows 兼容性问题，
以及我们决定要处理的巨大变更范围，所以推迟到了现在。

<Button @click="handleOpenLatest">
  下载
</Button>

尽管如此，我还是很兴奋终于能和大家分享我们在过去两个月里一直在准备的内容。

请查看我之前写的你可能感兴趣的博客和 DevLog 文章：

- [DreamLog 0x1](../DreamLog-0x1/)
- [DevLog @ 2025.05.16](../DevLog-2025.05.16/)

让我坦诚地告诉大家过去三个月的情况：

- [**391 次提交**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**1017 个文件变更**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**74,548 行代码新增**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**13,930 行代码删除**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)

> 但对于在软件行业工作的你们来说，这些数字毫无意义，
> 它们只是反映了我们在这个版本中所做重大影响的体现。
>
> 别担心，我会在这篇 DevLog 中带你了解重点内容。

## 里程碑

随着 v0.7 的发布和这篇 DevLog 的发布，
我想提一下我们迄今为止达成的一些里程碑：

- 我们在 GitHub 上获得了 1850+ 星标！🎉
- 我们有超过 40+ 贡献者！🫂
- 我们有超过 300+ Discord 成员！👾
- 我们在 [Hacker News](https://news.ycombinator.com/item?id=44573640) 上发布了自我介绍
- 我们在 [Product Hunt](https://www.producthunt.com/products/airi) 上发布了自我介绍
- 我们在 2025 年 7 月 17 日 GitHub 趋势榜上排名 `#1` 🏆

## 功能

### 桌面版本

Tamagotchi 是 AIRI 桌面版本的名称，你可以让它作为独立的、
始终运行的伴侣在桌面上运行，与其他应用程序一起工作而不会干扰你的工作。

之前，桌面版本更多处于实验阶段，UI/UX 不够精致和完善，
像本地 ASR/STT（语音转文字）这样的模块还不可用。
使用音频输入设备的设置也是缺失的部分。

但现在它有了巨大的改进。

#### 悬停淡出™

在上一个版本 v0.6 中，我们引入了**悬停淡出™**功能：

> 开个玩笑，我们在 MIT 许可证下开源这个项目，
> 这个功能没有任何注册商标。

::: tip
要关闭**悬停淡出**功能，默认快捷键是 <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="I" inline-block>I</kbd>
:::

<br />

<ThemedVideo autoplay src="./assets/airi-demo-fade-on-hover.mp4" />

许多用户发现每次光标悬停在角色上时，整个窗口都会淡出，这让他们感到困惑。
对于缺乏文档解释这个功能以及为什么我们认为它对 AI 伴侣很重要的道歉。

对于任何 VTuber 应用程序，VTuber Studio、Warudo 这两个最受欢迎的应用程序
支持 Live2D 和 VRM 3D 模型，由于它们是为 VTuber 流媒体目的设计的，
当使用 OBS（Open Broadcaster Software）进行流媒体时，
由于能够在不同层中编排场景元素的能力，用户不需要担心窗口顺序：
模型窗口将始终是一个最小化的窗口，具有透明背景，
供 OBS 或其他流媒体捕获驱动程序**在后台**捕获。

如果你打算使用 AIRI 进行 VTuber 流媒体，不使用悬停淡出功能是可以的，
但一旦你希望它作为虚拟伴侣生活在你的桌面上，你就会开始注意到：

- 如果我们设计让模型窗口始终置顶，它会阻止对其下方应用程序的鼠标事件，
  这不是我们想要的。
- 如果你必须手动切换模型窗口的可见性，这会带来很多不便，
  特别是在专注于你正在处理的事情时。

这就是为什么我们想出了这个主意：创建一个功能，允许 AIRI 中的任何角色
在鼠标悬停在窗口上时淡出，并将鼠标点击事件传递给其下方的应用程序。

我个人非常喜欢这个功能，因为我现在可以让 AIRI 中的角色
与我一起使用任何应用程序，而不用担心禁用或组织窗口顺序。
每天当我开发 AIRI 时，无论是 Web 版本还是桌面版本，
我都会始终在我的桌面上打开她，与终端、VSCode/Cursor 一起陪伴我。

**悬停淡出™**并不是我们在桌面版本中更新的唯一功能，
我们还对 UI/UX 进行了许多改进，并添加了更多功能使其更可用。

#### 移动

由于**悬停淡出™**窗口允许鼠标事件通过，
有时你可能想要移动或调整模型窗口的位置到更好的地方，
也许是右下角，或者底部中央...

可拖动区域的外观已经改进，带有圆角以匹配我们的主题。

::: tip
移动模式的默认快捷键是 <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="N" inline-block>N</kbd>
:::

<br />

<ThemedVideo autoplay src="./assets/airi-demo-move.mp4" />

进入移动模式时会显示一个可拖动区域，除了用鼠标移动位置外，
使用托盘菜单中的位置 > 居中 / 左下 / 右下也是另一个选择。

#### 调整大小

不是每个人的模型大小都一样，调整模型窗口大小的能力也很关键。

与移动模式相同，调整大小边框指示器应用了圆角，
头像的边缘也得到了修剪的圆角边缘。

::: tip
移动模式的默认快捷键是 <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="R" inline-block>R</kbd>
:::

<br />

<video autoplay controls muted loop playsinline>
  <source src="./assets/airi-demo-resize.mp4" type="video/mp4">
  您的浏览器不支持视频标签。
</video>

#### 资源岛

加载 ASR/STT（语音转文字）和 VAD（语音活动检测）的模型等待很痛苦，
我们必须找到一种方法来可视化不同模块和所需文件的下载进度，
就像 Steam 和 Battle.net 所做的那样。

我们设计了一套名为**资源岛**的新组件（灵感来自 iOS 的动态岛），
这是一个浮动的、可悬停的小部件，显示下载和安装模块的进度，
下载完成后它会消失。

观看实际操作：

<ThemedVideo autoplay src="./assets/airi-demo-resource-island.mp4" />

它确实包含一个指向准备模块的链接，因此你可以点击模块链接
打开目标模块设置页面，了解为什么需要这个模型或文件。

#### 本地 ASR/STT

感谢 [@luoling8192 (Luoling)](https://github.com/luoling8192)，以及我们在仓库
[candle-examples](https://github.com/proj-airi/candle-examples) 中进行的实验，
我们现在有了一个在 Windows、macOS 和 Linux 上工作的本地 ASR/STT 引擎。

<video autoplay controls muted loop playsinline>
  <source src="./assets/airi-demo-settings-hearing.mp4" type="video/mp4">
  您的浏览器不支持视频标签。
</video>

<br />

::: info
这个演示使用 OpenAI 的语音服务，但可以切换到本地提供商的 ASR/STT。
:::

最初我们尝试直接使用 candle，但我找不到一个好的方法来
为 Windows 和 Linux 构建使用和嵌入 candle 运行时（有和没有 CUDA），
我们决定切换到 ort（Rust 的 ONNX 运行时），它为我们提供了
相似的性能和准确性，但具有更好的兼容性和更容易使用。

### Web

#### 引导界面

我们知道现在配置 AIRI 相当复杂（但如果与许多其他纯 Python 基础的相比仍然容易，
那些需要你理解代码结构来配置）。

感谢 [Me1td0wn76 (melty kiss)](https://github.com/Me1td0wn76) 的贡献，
为 Web 版本添加了引导界面支持，现在你可以在第一次使用 AIRI 时
获得更好的体验。

他们在 Pull Request 合并后写了一篇博客来分享
贡献 Project AIRI 的经验：[AIRIプロジェクトに参加した話 - YAMA-blog](https://yama-pro.blog/posts/airi/)

<img class="light" src="./assets/airi-demo-onboarding-light.avif" alt="引导界面亮色模式" />
<img class="dark" src="./assets/airi-demo-onboarding-dark.avif" alt="引导界面暗色模式" />

观看实际操作：

<ThemedVideo
  autoplay
  light="./assets/airi-demo-onboarding-light.mp4"
  dark="./assets/airi-demo-onboarding-dark.mp4"
/>

#### VRM

感谢 [Lilia-Chen (Lilia_Chen)](https://github.com/Lilia-Chen) 的辛勤工作，
VRM 模型现在通过精确的相机实现和渲染机制显示得更好。

<img class="light" src="./assets/airi-demo-vrm-light.avif" alt="VRM 亮色模式" />
<img class="dark" src="./assets/airi-demo-vrm-dark.avif" alt="VRM 暗色模式" />

### 移动 Web

#### 引导界面

引导界面也可用于移动 Web 版本：

<ThemedVideo
  autoplay
  light="./assets/airi-demo-onboarding-mobile-light.mp4"
  dark="./assets/airi-demo-onboarding-mobile-dark.mp4"
/>

#### 场景

移动端的主要场景已经完全重新设计和重写。

感谢 [LemonNekoGH (LemonNeko)](https://github.com/LemonNekoGH)，我们现在有了
更好的方法来调整场景中 Live2D 模型的偏移量。

我们从 iOS 侧边的音量控制中汲取了这个设计理念，
希望你能发现它更直观和直接上手。

::: tip
想要重置为默认值？双击 X、Y 或缩放按钮将值重置为默认值。
:::

<br />

<video class="light" autoplay controls muted loop playsinline>
  <source src="./assets/airi-demo-quick-editor-mobile-light.mp4" type="video/mp4">
  您的浏览器不支持视频标签。
</video>

<video class="dark" autoplay controls muted loop playsinline>
  <source src="./assets/airi-demo-quick-editor-mobile-dark.mp4" type="video/mp4">
  您的浏览器不支持视频标签。
</video>

### 两个版本

我们为这些功能制作了许多更有趣的新组件。

#### 更好的文本动画

我们改进了聊天气泡的文本动画，[sumimakito (Makito)](https://github.com/sumimakito/)
几天前写了一整篇详细的 DevLog，解释了为什么我们特别实现它
以及我们如何考虑其 i18n 兼容性，一定要去看看：[DevLog 2025.08.01](../DevLog-2025.08.01/)。

观看实际操作：

<video class="light" autoplay controls muted loop playsinline>
  <source src="./assets/airi-demo-clustr-light.mp4" type="video/mp4">
  您的浏览器不支持视频标签。
</video>

<video class="dark" autoplay controls muted loop playsinline>
  <source src="./assets/airi-demo-clustr-dark.mp4" type="video/mp4">
  您的浏览器不支持视频标签。
</video>

#### 电平表

> UI 组件：https://airi.moeru.ai/ui/#/story/src-components-gadgets-levelmeter-story-vue

在希望显示检测到的音频输入电平或实时系统负载时很有用：

<img class="light" src="./assets/airi-ui-level-meter-light.avif" alt="电平表亮色模式" />
<img class="dark" src="./assets/airi-ui-level-meter-dark.avif" alt="电平表暗色模式" />

#### 时间序列图表

> UI 组件：https://airi.moeru.ai/ui/#/story/src-components-gadgets-timeserieschart-story-vue

类似于用于变化值的电平表，但对于历史数据特别有用。

<img class="light" src="./assets/airi-ui-time-series-chart-light.avif" alt="时间序列图表亮色模式" />
<img class="dark" src="./assets/airi-ui-time-series-chart-dark.avif" alt="时间序列图表暗色模式" />

我们还添加了许多更多组件...

- [x] `<Progress />`（感谢 @Menci [2cb602aa](https://github.com/moeru-ai/airi/commit/2cb602aa3eac456a479b622a5ecf043831597ffe)）
- [x] `<FieldSelect />` ([d0d782ff](https://github.com/moeru-ai/airi/commit/d0d782ff94a5a0a12819725303f687bd1a47e87c))
- [x] `<Alert />`（感谢 [@typed-sigterm](https://github.com/typed-sigterm), [#295](https://github.com/moeru-ai/airi/pull/295)）
- [x] `<ErrorContainer />`（感谢 [@typed-sigterm](https://github.com/typed-sigterm), [#295](https://github.com/moeru-ai/airi/pull/295)）
- [x] 新的侧边栏导航设计
- [x] 消息提示器
- [x] 有新版本时提示用户更新

## 社区

### 新的文档站点

我们现在有了一个全新的文档站点：

<video class="light" autoplay controls muted loop playsinline>
  <source src="./assets/airi-docs-light.mp4" type="video/mp4">
  您的浏览器不支持视频标签。
</video>

<video class="dark" autoplay controls muted loop playsinline>
  <source src="./assets/airi-docs-dark.mp4" type="video/mp4">
  您的浏览器不支持视频标签。
</video>

它看起来非常棒，我们完全重写了它，基于 [Reka UI](https://reka-ui.com) 的工作
但添加了大量功能，包括博客文章列表、语言切换，并将许多样式适配到 VitePress。

一如既往，感谢他们美丽的设计，我们使用了许多他们的组件来构建我们自己的，
一定要去看看！

博客页面看起来也很好，更好的是，有由 [@lynzrand (Rynco Maekawa)](https://github.com/lynzrand) 设计的新封面

<img class="light" src="./assets/airi-docs-blogs-light.avif" alt="博客页面亮色模式" />
<img class="dark" src="./assets/airi-docs-blogs-dark.avif" alt="博客页面暗色模式" />

### 翻译工作流变更

我们将所谓的 `i18n` 或本地化文件拆分到我们自己的巨大 monorepo 中的专用包中。

当贡献新的本地化、添加新翻译或修复现有翻译时，
请先导航到 https://github.com/moeru-ai/airi/tree/main/packages/i18n/src/locales。

<img class="light" src="./assets/airi-packages-i18n-light.avif" alt="i18n 包结构亮色模式" />
<img class="dark" src="./assets/airi-packages-i18n-dark.avif" alt="i18n 包结构暗色模式" />

你会在这里找到不同语言的不同目录。选择所需的语言并继续。

以英语为例，目录结构如下：

```bash
└── en
  ├── docs
  ├── tamagotchi
  #
  ├── base.yaml
  ├── settings.yaml
  ├── stage.yaml
  └── index.ts
```

`docs` 和 `tamagotchi` 是两个专门用于不同模块的目录：

- 文档站点
- 桌面版本（Tamagotchi）

如果你想帮助翻译文档站点（UI，不是文章或实际文档），
你可以导航到 `docs` 目录，编辑 `theme.yaml` 文件，
其中包含文档站点的 UI 字符串。

`tamagotchi` 目录有点特殊，你可能无法找到所有的翻译字符串，
它旨在包含仅在桌面版本中使用的几个特殊翻译，
而其他所有内容都在根目录中。

对于 `docs` 和 `tamagotchi` 之外的所有内容：

- `base.yaml` 包含语言的基本字符串，按钮的基本状态
- `settings.yaml` 包含设置页面的字符串
- `stage.yaml` 包含舞台的字符串（显示模型的 UI）

如果你想添加更多语言，复制并粘贴一个现有的语言本地化目录，
并将其重命名为新的语言代码，例如，如果你想添加法语，
复制 `en` 目录到 `fr`，并开始编辑 `base.yaml`、`settings.yaml`、
`stage.yaml` 和 `index.ts` 文件来添加翻译。
在 Pull Request 审查过程中，部分翻译文件是可以的。

::: info 需要帮助！
这听起来有点荒谬，我们希望有一些经验丰富的人
帮助我们集成我们的 i18n 包与翻译自动化工具，
如 [Crowdin](https://crowdin.com) 或 [Weblate](https://weblate.org/en/)。

我们不是这个领域的专家，请随时打开 Pull Request 来帮助我们
或打开一个 issue 来讨论它。
:::

对于语言代码，请使用以下任一工具来查找你正在使用的语言代码：

- [语言子标签查找应用](https://r12a.github.io/app-subtags/)
- [iana.org/assignments/language-subtag-registry/language-subtag-registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry)

```bash
.
├── packages
    ├── i18n
    ├── package.json
    └── src
         ├── index.ts
         └── locales
             ├── en
             │   ├── base.yaml
             │   ├── docs
             │   │   ├── index.ts
             │   │   └── theme.yaml
             │   ├── index.ts
             │   ├── settings.yaml
             │   ├── stage.yaml
             │   └── tamagotchi
             │       ├── index.ts
             │       ├── settings.yaml
             │       └── stage.yaml
             ├── index.ts
             └── zh-Hans
                 ├── base.yaml
                 ├── docs
                 │   ├── index.ts
                 │   └── theme.yaml
                 ├── index.ts
                 ├── settings.yaml
                 ├── stage.yaml
                 └── tamagotchi
                     ├── index.ts
                     ├── settings.yaml
                     └── stage.yaml
```

你可以在这里阅读更多相关资源：

- https://developer.mozilla.org/en-US/docs/Glossary/BCP_47_language_tag
- https://en.wikipedia.org/wiki/IETF_language_tag
- https://en.wikipedia.org/wiki/ISO_15924

## 工程

### 工具链使我们的工作流程快了很多倍

TL;DR：

- 我们将许多包转换为**无构建**设置
- 我们从 `unbuild` 中删除了 `stub`
- 我们切换到 `rolldown-vite`
- 我们用 `tsdown` 替换了 `unbuild`
- 我们集成了 `turborepo` 以实现更快和缓存的构建

更详细地说：

以前，为了实现无缝的开发体验，当我们选择使用 Monorepo 架构时，
我们必须依赖 `postinstall` 脚本来引导带有它们自己的 `jiti` 导出和 `.d.ts` 模块的存根包，
每次贡献者在克隆我们的项目后安装依赖时都要这样做。

这确保了贡献者不需要学习 monorepo 的工作原理来贡献。
然而，很明显，每次 `pnpm install` 触发时重新构建和重新存根不是一个聪明的策略。

随着 [@kwaa](https://github.com/kwaa) 为无构建架构引入的变更，
之前花费最多时间的最大的包 `stage-ui` 可以跳过而不会遇到任何类型检查或依赖解析问题。

后来，[@kwaa](https://github.com/kwaa) 帮助移除了有时有问题的、冗余的由 `unbuild` 带来的 `stub` 脚本，
这给了我们一个更干净的工作流程，不需要再与烦人的
`The requested module './dist/index.mjs' does not provide an export named 'foo'` 错误作斗争。

最大的变化来自两个月前，[@kwaa](https://github.com/kwaa) 选择切换到 `rolldown-vite` 来替换 `vite`
以**实现更快的工作流程：快 2 倍**。

但这还不是终点，我们用 `tsdown` 替换了 `unbuild`，这**引入了另一个 4.2 倍的速度提升**，
每个子包现在构建时间不到 250 毫秒。

> 迁移到 `tsdown` 还有更多好处...
>
> - 执行未使用依赖检查
> - 打包 CSS
> - 打包 Vue SFC 组件

现在，`postinstall` 脚本仍然是必需的，如果我们能找到一种方法
通过依赖感知来缓存构建结果，许多冗余的构建可以被避免。
这就是 `turborepo` 帮助我们实现更快构建的地方。
使用 `turborepo`，构建 AIRI 所需的时间**从平均 4 分钟减少到 25 秒**。

### 现在支持 Nix

感谢 [@Weathercold (Weathercold)](https://github.com/Weathercold)，我们现在
有了一个 Nix flake 来构建 AIRI，这是对跨平台兼容性的一个很好的补充。
它甚至在 macOS 上也能工作。

我们正在等待最终的 Pull Request 合并到 nix-pkgs 中，
但你可以使用以下命令尝试它：

```bash
nix run --extra-experimental-features 'nix-command flakes' github:moeru-ai/airi
```

### 统一的构建流水线

以前，测试、暂存和发布的构建流水线都不同，
这对我来说是决定发布新版本的噩梦，
因为我们不确定流水线是否会成功。

虽然 Tauri 为我们带来了许多跨平台兼容性的好处，
以及使用 Rust 进行系统调用和集成到原生操作系统功能的强大能力...

最初，在 v0.7 开发的早期阶段，我引入了
[huggingface/candle](https://github.com/huggingface/candle) 作为 ASR/STT 流水线的推理引擎实现，
但它依赖于 NVIDIA CUDA，所以构建真的很混乱，到处都是不兼容性。

但现在好多了，我们有一个计划的构建流水线，每天运行与发布相同的脚本和工作流程步骤。
（你可能听说过它作为 `canary` 或 `nightly` 构建。）

所以从技术上讲，如果你遇到最新版本的任何问题，
你总是可以尝试 `main` 分支的最新构建来查看我们是否修复了它。

夜间构建可以在 https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml 找到

## 结束之前...

在这个版本之间诞生的新包：

> 大声喊出 [@sumimakito](https://github.com/sumimakito)，她做了这么多惊人的事情... 我甚至数不清...

- [`@proj-airi/chromatic`](https://github.com/proj-airi/chromatic)（由 [@sumimakito](https://github.com/sumimakito) 制作）
- [`@proj-airi/unocss-preset-chromatic`](https://github.com/proj-airi/chromatic)（由 [@sumimakito](https://github.com/sumimakito) 制作）
- [`@moeru-ai/jem`](https://github.com/moeru-ai/inventory/tree/main/packages/jem-validator)（由 [@LemonNekoGH](https://github.com/LemonNekoGH) 制作），统一模型目录
- [`clustr`](https://github.com/sumimakito/clustr)（由 [@sumimakito](https://github.com/sumimakito) 制作）
- [`@proj-airi/drizzle-orm-browser`](https://github.com/proj-airi/drizzle-orm-browser)（由我制作）

在这个版本之间诞生的副项目：

- [HuggingFace Inspector](https://hf-inspector.moeru.ai/) (https://github.com/moeru-ai/hf-inspector)
- [关于 whisper & VAD、candle、burn 和 ort 的更多 candle 示例](https://github.com/proj-airi/candle-examples)
- [（模型目录）Inventory 提交！](https://github.com/moeru-ai/inventory/pull/1)（由 [@LemonNekoGH](https://github.com/LemonNekoGH) 制作）

我们无法在这篇 DevLog 中涵盖所有内容，有关详细信息，你总是可以跟踪和回顾
我们的路线图上的 [Roadmap v0.7](https://github.com/moeru-ai/airi/issues/200)。

<div class="w-full flex flex-col items-center justify-center gap-3 py-3">
  <img src="./assets/relu-sticker-thinks.avif" alt="ReLU 贴纸思考" class="w-30!" />
  <div class="text-center">
    <span class="block font-bold">感谢你一直读到这里！</span>
  </div>
</div>
