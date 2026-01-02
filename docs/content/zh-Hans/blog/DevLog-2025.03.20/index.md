---
title: 开发日志 @ 2025.03.20
category: DevLog
date: 2025-03-20
---

<script setup>
import Gelbana from './assets/steins-gate-gelnana-from-elpsycongrooblog.avif'
import NewUIV3 from '../DevLog-2025.03.10/assets/new-ui-v3.avif'
import NewUIV3Dark from '../DevLog-2025.03.10/assets/new-ui-v3-dark.avif'
import HistoireColorSlider from './assets/histoire-color-slider.avif'
import HistoireColorSliderDark from './assets/histoire-color-slider-dark.avif'
import HistoireLogo from './assets/histoire-logo.avif'
import HistoireLogoDark from './assets/histoire-logo-dark.avif'
import NewUIV4Speech from './assets/new-ui-v4-speech.avif'
import NewUIV4SpeechDark from './assets/new-ui-v4-speech-dark.avif'
import SteinsGateMayori from './assets/steins-gate-mayori.avif'
</script>

又见面了！距离上一篇开发日志已经过去10天了。

我们对用户界面进行了大量改进，使其能够集成更多的 LLM 提供商和语音提供商，并首次在 Discord、bilibili 和许多其他社交媒体平台上发布了 AIRI。

还有很多我们迫不及待想要告诉你的内容。

## 似曾相识

让我们把时间倒回一点！

<img :src="Gelbana" alt="Gelbana" />

> 啊，别担心，我们心爱的 [AIRI](https://github.com/moeru-ai/airi) 不会变成这样的 GEL-NANA。不过，如果你还没有看过 [_Steins;Gate_](https://myanimelist.net/anime/9253/Steins_Gate) 动漫系列，强烈推荐你试试看~！

我们一直在开发初始设置 UI 设计，动画效果得到了改进，10天前实现了可自定义的主题着色。对我们任何人来说，这确实是忙碌的一周（特别是我们都是兼职参与这个项目，哈哈，如果你愿意的话，欢迎加入我们。🥺（恳求脸））。

这是我们当时得到的最终结果：

<img class="light" :src="NewUIV3" alt="new ui" />
<img class="dark" :src="NewUIV3Dark" alt="new ui" />

<h2 class="devlog-steins-gate-divergence-meter-heading">
  <span class="nixie-digit">0</span>
  <span class="nixie-digit">.</span>
  <span class="nixie-digit">5</span>
  <span class="nixie-digit">7</span>
  <span class="nixie-digit">1</span>
  <span class="nixie-digit">0</span>
  <span class="nixie-digit">2</span>
  <span class="nixie-digit">4</span>
</h2>

~~欢迎来到 β 世界线。~~

由于我们有了模型单选组和导航项的彩色卡片，以及可自定义的主题，显然在业务工作流程中调试 UI 组件时肯定会遇到困难，这会明显拖慢我们的开发速度。

这就是我们决定引入名为 [`Histoire`](https://histoire.dev) 的神奇工具的原因，它基本上是一个 [Storybook](https://storybook.js.org/)，但对 [Vite](https://vitejs.dev) 和 [Vue.js](https://vuejs.org) 组合更加原生。

这是 [@sumimakito](https://github.com/sumimakito) 完成后录制的第一眼：

<ThemedVideo muted autoplay src="./assets/histoire-first-look.mp4" />

整个 OKLCH 调色板可以一次性展开到画布上，供我们参考。但是要尝试颜色并获得与 Project AIRI 主题相同的感觉方案并不完美，不是吗？

所以我首先重新实现了颜色滑块，感觉更合适：

<img class="light" :src="HistoireColorSlider" alt="color slider" />
<img class="dark" :src="HistoireColorSliderDark" alt="color slider" />

这确实让滑块更加专业。

logo 和默认的绿色可以被替换以与 AIRI 的主题保持一致，这就是为什么我为 UI 页面专门设计了另一个 logo：

<img class="light" :src="HistoireLogo" alt="project airi logo for histoire" />
<img class="dark" :src="HistoireLogoDark" alt="project airi logo for histoire" />

哦，对了，整个 UI 组件已经像往常一样部署到 Netlify，路径为 `/ui/`，如果你想知道 UI 元素是什么样子的，请随时查看：
[https://airi.moeru.ai/ui/](https://airi.moeru.ai/ui/)

还有很多其他功能我们无法在这个开发日志中完全涵盖：

- [x] 支持所有 LLM 提供商。
- [x] 改进了菜单导航 UI 的动画和过渡。
- [x] 改进了字段的间距，新表单！
- [x] 组件（[路线图](https://github.com/moeru-ai/airi/issues/42)上几乎所有待办组件）
  - [x] 表单
    - [x] 单选
    - [x] 单选组
    - [x] 模型目录
    - [x] 范围
    - [x] 输入
    - [x] 键值输入
  - [x] 数据 GUI
    - [x] 范围
  - [x] 菜单
    - [x] 菜单项
    - [x] 菜单状态项
  - [x] 图形
    - [x] 3D
  - [x] 物理
    - [x] 光标动量
  - [x] 更多...

我们还对动量和 3D 进行了一些其他实验。

看看这个：

<img class="light" :src="NewUIV4Speech" alt="brand new speech design" />
<img class="dark" :src="NewUIV4SpeechDark" alt="brand new speech design" />

我们终于支持语音模型配置了 🎉！（之前只能配置 ElevenLabs）自从我们正在开发的另一个神奇项目 `unspeech` 的[新 `v0.1.2` 版本](https://github.com/moeru-ai/unspeech/releases/tag/v0.1.2)以来，可以通过 [`@xsai/generate-speech`](https://xsai.js.org/docs/packages/generate/speech) 请求 Microsoft Speech 服务（也就是 Azure AI Speech 服务，或认知语音服务），这意味着我们终于为 Microsoft 获得了一个 OpenAI API 兼容的 TTS 服务。

但为什么支持这个如此重要？

这是因为对于 Neuro-sama 的第一个版本，文本转语音服务是由 Microsoft 提供支持的，使用名为 `Ashley` 的声音，加上 `+20%` 的音调，你可以得到与 Neuro-sama 第一个版本相同的声音，自己试试：

<audio controls style="width: 100%;">
  <source src="./assets/ashley-pitch-test.mp3" />
</audio>

不是完全一样吗，这简直太疯狂了！这意味着，我们终于可以通过新的**语音**能力接近 Neuro-sama 所能做到的事情！

<img :src="SteinsGateMayori" alt="character from anime Steins;Gate" />

<h2 class="devlog-steins-gate-divergence-meter-heading">
  <span class="nixie-digit">1</span>
  <span class="nixie-digit">.</span>
  <span class="nixie-digit">3</span>
  <span class="nixie-digit">8</span>
  <span class="nixie-digit">2</span>
  <span class="nixie-digit">7</span>
  <span class="nixie-digit">3</span>
  <span class="nixie-digit">3</span>
</h2>

有了所有这些，我们可以得到这个结果：

<ThemedVideo controls muted autoplay src="./assets/airi-demo.mp4" />

几乎一模一样。但我们的故事并没有在这里结束，目前，我们还没有实现记忆功能、更好的动作控制，转录设置 UI 也缺失了。希望我们能在月底前完成这些工作。

我们计划拥有

- [ ] 记忆 Postgres + Vector
- [ ] 嵌入设置 UI
- [ ] 转录设置 UI
- [ ] 记忆 DuckDB WASM + Vector
- [ ] 动作嵌入
- [ ] 语音设置 UI

今天的 DevLog 就到这里，感谢所有参加 DevStream 并一直陪伴到最后的大家。

明天见。

> El Psy Congroo.
