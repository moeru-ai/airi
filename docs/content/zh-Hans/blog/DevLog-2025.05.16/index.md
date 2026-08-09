---
title: 开发日志 @ 2025.05.16
category: DevLog
date: 2025-05-16
---

<script setup>
import VelinLight from './assets/velin-light.avif'
import VelinDark from './assets/velin-dark.avif'

import CharacterCardMenuLight from './assets/character-card-menu-light.avif'
import CharacterCardMenuDark from './assets/character-card-menu-dark.avif'

import CharacterCardSettingsLight from './assets/character-card-settings-light.avif'
import CharacterCardSettingsDark from './assets/character-card-settings-dark.avif'

import CharacterCardShowcaseLight from './assets/character-card-showcase-light.avif'
import CharacterCardShowcaseDark from './assets/character-card-showcase-dark.avif'

import VelinPlaygroundLight from './assets/velin-playground-light.avif'
import VelinPlaygroundDark from './assets/velin-playground-dark.avif'

import DemoDayHangzhou1 from './assets/demo-day-hangzhou-1.avif'
import DemoDayHangzhou2 from './assets/demo-day-hangzhou-2.avif'
import DemoDayHangzhou3 from './assets/demo-day-hangzhou-3.avif'
</script>

大家好！我是 [Neko](https://github.com/nekomeowww)，[Project AIRI](https://github.com/moeru-ai/airi) 的发起者！

很抱歉在 Project AIRI 的 DevLog 更新上有所延迟，请原谅我们的拖延。

> 在过去的几个月里，我们为 AIRI 写了许多精彩的 DevLog，分享我们的开发进展，在其中我们分享了想法、理念，解释了我们使用的技术、从中获得的艺术灵感...一切的一切。
>
> - [v0.4.0 UI 更新](./DevLog-2025.03.20.mdx)
> - [v0.4.0 发布 & 记忆功能介绍](./DevLog-2025.04.06.mdx)
>
> 我也写了这两篇精彩且受欢迎的 DevLog！希望你们喜欢阅读它们。

# 似曾相识

在过去的几周里，Project AIRI 本身的主要任务有一段时间没有进展，也许我在 2025 年 3 月以来的大规模 UI 重构和发布后有些疲惫。大部分工作都是由社区维护者完成的，

非常感谢 [@LemonNekoGH](https://github.com/LemonNekoGH)、[@RainbowBird](https://github.com/luoling8192) 和 [@LittleSound](https://github.com/LittleSound) 在以下领域所做的工作：

- 角色卡支持

::: tip 什么是角色卡？
本地优先的聊天应用程序如 [SillyTavern](https://github.com/SillyTavern/SillyTavern)、[RisuAI](https://risuai.net/) 或在线服务如 [JanitorAI](https://janitorai.com/) 使用一个包含角色背景、性格和其他角色扮演必要上下文的文件来定义每个独立的角色。

- https://realm.risuai.net/
- https://aicharactercards.com/
- https://chub.ai/

角色卡并不是存储和分享 LLM 驱动的角色扮演角色的唯一方式，[Lorebook（故事书）](https://docs.novelai.net/text/lorebook.html) 在这个领域扮演着另一个关键角色，但这完全是另一个值得写一整套文档系列来分享的故事，现在，试着阅读 [Void's Lorebook Types](https://rentry.co/lorebooks-and-you) 和 [AI Dynamic Storytelling Wiki](https://aids.miraheze.org/wiki/Main_Page)。

> 我个人很喜欢这个学习这些概念的 wiki：[AI Dynamic Storytelling Wiki](https://aids.miraheze.org/wiki/Main_Page)，如果你对 AI 角色扮演感兴趣，值得一读。
:::

> 要使用角色卡，导航到设置页面（应用程序右上角，或在桌面应用程序中悬停齿轮图标），找到并点击"Airi Card"按钮。

<img class="light" :src="CharacterCardMenuLight" alt="提供 Airi Card 菜单按钮的菜单截图" />
<img class="dark" :src="CharacterCardMenuDark" alt="提供 Airi Card 菜单按钮的菜单截图" />

> 这将带你到"Airi Card 编辑器界面"，在那里你可以上传和编辑你的角色卡进行人格定制。

<img class="light" :src="CharacterCardSettingsLight" alt="提供 Airi Card 菜单按钮的菜单截图" />
<img class="dark" :src="CharacterCardSettingsDark" alt="提供 Airi Card 菜单按钮的菜单截图" />

对于角色卡展示，我们也尝试了一些方法...

<img class="light" :src="CharacterCardShowcaseLight" alt="一个名为 ReLU 的蓝发角色的卡片式用户界面设计" />
<img class="dark" :src="CharacterCardShowcaseDark" alt="一个名为 ReLU 的蓝发角色的卡片式用户界面设计" />

它在我们的 UI 组件库中是实时的，你可以在这里玩玩：https://airi.moeru.ai/ui/#/story/src-components-menu-charactercard-story-vue 。

> 纯 CSS 和 JavaScript 控制，布局有效，所以我们不需要担心画布计算。
>
> 哦，角色卡展示的大部分工作都是由 [@LittleSound](https://github.com/LittleSound) 完成和指导的，非常感谢。

- Tauri MCP 支持
- 连接 AIRI 到 Android 设备

这两个是主要的更新和尝试，这部分工作由 [@LemonNekoGH](https://github.com/LemonNekoGH) 完成，她为这些内容写了另外两篇 DevLog，分享了幕后的技术细节。（我想对 Tauri 开发者和用户来说很有价值。）你可以在这里阅读它们：

- [控制 Android](./DevLog-2025.04.22.mdx)
- [Tauri 中的 MCP](./DevLog-2025.04.28.md)

## Project AIRI 主要任务

### 耳朵在听，嘴巴在说

从 4 月 15 日开始，我发现 AIRI 中的 VAD（语音激活检测）、[ASR（即自动语音识别）](https://huggingface.co/tasks/automatic-speech-recognition) 和 [TTS（文本转语音）](https://huggingface.co/tasks/text-to-speech) 都非常复杂且难以使用和理解，在那个时候，我正在与 [@himself65](https://github.com/himself65) 合作改进和测试来自 [Llama Index](https://www.llamaindex.ai/) 的新项目的用例，这是一个帮助处理基于事件的 LLM 流式令牌流和音频字节的库，叫做 [`llama-flow`](https://github.com/run-llama/llama-flow)。

[`llama-flow`](https://github.com/run-llama/llama-flow) 真的很小，而且使用起来类型安全。在没有它的旧时代，我必须手动包装另一个**队列**结构，以及 Vue 的响应式驱动的工作流系统，将许多异步任务链接在一起，以便能够处理数据来驱动 AIRI。

那时我开始实验更多的例子，简化 VAD、ASR、TTS 工作流的演示。

最终，我得到了这个：[WebAI 实时语音聊天示例](https://github.com/proj-airi/webai-example-realtime-voice-chat)，我设法证明了这项工作可以在 Web 浏览器中用一个 300 ~ 500 行的 TypeScript 代码来实现 ChatGPT 语音聊天系统。

<ThemedVideo controls muted src="./assets/webai-examples-demo.MP4" style="height: 640px;" />

我尽力将所有可能的步骤分解为小的可重用片段，以帮助演示如何从头开始构建实时语音聊天系统：

- [VAD](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad)
- [VAD + ASR](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr)
- [VAD + ASR + LLM 聊天](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr-chat)
- [VAD + ASR + LLM 聊天 + TTS](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr-chat-tts)

> 希望你能从中学到一些东西。

在这段时间里，我们发现了一个有趣且强大的仓库，叫做 [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)，它支持跨 macOS、Windows、Linux、Android、iOS 等 12 种语言的 18 种语音处理任务。令人着迷！

所以 [@luoling](https://github.com/luoling8192) 也为此做了另一个小演示：[Sherpa ONNX 驱动的 VAD + ASR + LLM 聊天 + TTS](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/main/apps/sherpa-onnx-demo)

#### xsAI 🤗 Transformers.js 的诞生

由于我们为 VAD、ASR、聊天和 TTS 演示所做的工作，这催生了一个名为 [xsAI 🤗 Transformers.js](https://github.com/proj-airi/xsai-transformers) 的新副项目，它简化了调用 WebGPU 驱动的模型推理和使用 workers 提供服务，同时仍然保持与我们之前成功的项目 [xsAI](https://github.com/moeru-ai/xsai) 的 API 兼容性。

我们也为此做了一个游乐场...在 [https://xsai-transformers.netlify.app](https://xsai-transformers.netlify.app) 上玩玩吧。

你今天就可以通过 npm 安装它！

```bash
npm install xsai-transformers
```

::: tip 这意味着什么？
这意味着你可以通过一个 if 开关在云端 LLM 和语音提供商与本地 WebGPU 驱动的模型之间切换。

这为我们带来了一个新的可能性，能够在浏览器中实验甚至实现简单的 RAG 和重排序系统，而无需任何服务器端代码，甚至不需要后端服务器。

哦，Node.js 也支持！
:::

### Telegram 机器人

我添加了 Telegram 机器人支持，能够处理动画贴纸，由 `ffmpeg` 驱动（还能是什么，显然）。现在它可以读取和理解用户发送的动画贴纸甚至视频。

系统提示词太大了，我设法大幅减少了系统提示词的大小，节省了超过 **80%** 的令牌使用量。

### 角色卡展示

许多图像资源需要我手动找到合适且易于使用的在线解决方案来去除背景，但我决定基于 [Xenova](https://github.com/xenova) 所做的工作...为自己制作一个。

我在系统中集成 WebGPU 驱动的背景去除器方面做了一些小实验，你可以在 [https://airi.moeru.ai/devtools/background-remove](https://airi.moeru.ai/devtools/background-remove) 这里玩玩。

### xsAI & unSpeech

我们添加了对阿里云模型工作室和火山引擎作为语音提供商的支持，我想很有用？

### UI

- 新的[教程步骤器](https://airi.moeru.ai/ui/#/story/src-components-misc-steppers-steppers-story-vue?variantId=src-components-misc-steppers-steppers-story-vue-0)、[文件上传](https://airi.moeru.ai/ui/#/story/src-components-form-input-inputfile-story-vue?variantId=default) 和 [文本区域](https://airi.moeru.ai/ui/#/story/src-components-form-textarea-textarea-story-vue?variantId=default) 组件
- 颜色问题
- [排版改进](https://airi.moeru.ai/ui/#/story/stories-typographysans-story-vue?)

更多故事可以在 [Roadmap v0.5](https://github.com/moeru-ai/airi/issues/113) 中找到

## 副任务

### [Velin](https://github.com/luoling8192/velin)

自从我们支持了角色卡，在处理模板变量渲染和组件重用时感觉不是很好和流畅...

如果...

- 我们可以维护一个组件提示词库，可以用于其他代理或角色扮演应用程序，甚至角色卡？
  - 例如：
    - 为魔法和龙拥有中世纪奇幻背景设置
    - 我们唯一需要做的就是在将世界设置包装在外面时专注于我们新角色的写作
    - 也许，只有当时间到了夜晚，特殊的提示词才会通过 `if` 和 `if-else` 控制流被注入
  - 我们可以围绕它做更多事情...
    - 使用 Vue SFC 或 React JSX，我们可以解析模板并识别 props，在编写提示词时渲染一个用于调试和测试的表单面板
    - 在单个交互页面中可视化整个 lorebook 和角色卡

那么为什么我们不制作一个工具来用前端框架如 Vue 或 React 编写 LLM 提示词，也许将此扩展到其他框架和平台？

这就是我们得到的：[**Velin**](https://github.com/luoling8192/velin)。

<img class="light" :src="VelinLight" alt="用 Vue.js 编写 LLM 提示词的工具" />
<img class="dark" :src="VelinDark" alt="用 Vue.js 编写 LLM 提示词的工具" />

我们甚至制作了一个用于编辑和实时渲染的游乐场，同时享受 npm 包的生态系统（是的，你可以导入任何包！）。

<img class="light" :src="VelinPlaygroundLight" alt="用 Vue.js 编写 LLM 提示词的工具" />
<img class="dark" :src="VelinPlaygroundDark" alt="用 Vue.js 编写 LLM 提示词的工具" />

在这里试试：https://velin-dev.netlify.app

也支持编程 API，Markdown（MDX 正在开发中，支持 MDC），你今天就可以通过 npm 安装它！

```bash
npm install @velin-dev/core
```

好吧...今天就到这里，我希望你们喜欢阅读这篇 DevLog。

让我们用我们最近在中国杭州参加的活动的更多图片来结束 DevLog：**Demo Day @ 杭州**。

<img :src="DemoDayHangzhou1" alt="Demo Day @ 杭州" />

这是我，我与其他参与者分享了 AIRI 项目，我们在那里度过了美好的时光！遇到了许多有才华的开发者、产品设计师和企业家。

介绍了我今天在这篇 DevLog 中分享的几乎所有内容，还有备受喜爱的 AI VTuber Neuro-sama。

我用来分享的幻灯片是这样的：

<img :src="DemoDayHangzhou2" alt="Demo Day @ 杭州" />
<img :src="DemoDayHangzhou3" alt="Demo Day @ 杭州" />

幻灯片本身是完全开源的，你也可以在这里玩玩：[https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1](https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1)

## 里程碑

哦...由于这篇 DevLog 也标志着 v0.5.0 的发布，我想提及一些我们在过去几周达到的里程碑：

- 我们达到了 700 颗星！
- 4+ 个新的 issue 贡献者！
- Discord 服务器中 72+ 个新的群组成员！
- ReLU 角色设计完成！
- ReLU 角色建模完成！
- 与几家公司就赞助和合作进行了谈判！
- [Roadmap v0.5](https://github.com/moeru-ai/airi/issues/113) 完成了 92 个任务
  - UI
    - 加载屏幕和教程模块
    - 多个错误修复，包括加载状态和 Firefox 兼容性问题
  - 身体
    - 动作嵌入和来自语义的 RAG，在私有仓库"moeru-ai/motion-gen"中开发
    - 使用嵌入提供商和 DuckDB WASM 的向量存储和检索
  - 输入
    - 修复了 Discord 语音频道语音识别
  - 输出
    - 实验性唱歌功能
  - 工程
    - 跨项目共享 UnoCSS 配置
    - "moeru-ai/inventory"中的模型目录
    - 跨组织的包重组
  - 资源
    - 新的角色资源，包括贴纸、UI 元素、VTuber 标志
    - 语音线选择功能
    - 角色"Me"和"ReLU"的 Live2D 建模
  - 社区支持和营销
    - 日语 README
    - 全面的文档

再见！
