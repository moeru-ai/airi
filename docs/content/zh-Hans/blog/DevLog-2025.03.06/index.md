---
title: 开发日志 @ 2025.03.06
category: DevLog
date: 2025-03-06
---

## 似曾相识

前一天在开发直播中，我展示了为 AIRI 制作基础动画和过渡效果的进展情况。

主要目标是将 [@yui540](https://yui540.com/) 的优秀作品移植并适配为可重用的 Vue 组件，
让任何 Vue 项目都能方便地使用这些精美的动画效果。

> 关于 yui540 的详细信息以及相关引用库和工作内容，都已经整理到新部署的文档网站中：
> [https://airi.build/references/design-guidelines/resources/](../references/design-guidelines/resources/)。

最终的移植效果相当不错，已经部署到
[https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/)。

![](./assets/animation-transitions.gif)

> 另外，从现在开始，每个包的所有演示场都将使用
> "proj-airi" + "${subDirectory}" + "${packageName}" 模式进行 Netlify
> 部署。

虽然前一天的主要目标是将 CSS 实现拆分为 Vue 组件，但实际的可重用性部分还没有完全实现。
我仍然需要设计一个既灵活又可扩展的工作流程和机制，以便其他页面能够方便地使用。

## 白天

我尝试使用了 [`unplugin-vue-router`](https://github.com/posva/unplugin-vue-router) 提供的 [`definePage`](https://uvr.esm.is/guide/extending-routes.html#definepage) 宏钩子，发现它非常适合我的使用场景，于是决定继续沿着这个方向探索。

我从 [https://cowardly-witch.netlify.app/](https://cowardly-witch.netlify.app/) 移植了 3 个额外的新动画过渡效果，它们已经在 [https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/) 上可用。

我昨天将官方文档网站部署到了 [https://airi.build](https://airi.build)，[@kwaa](https://github.com/kwaa) 评论说他建议我尝试 `https://airi.more.ai/docs` 的方法，~~但我没能想出如何为/docs 设置一个 200 重定向代理。~~

编辑：终于学会了如何做到这一点，将在未来的开发日志中包含详细信息。

我尝试了一下，大约有十个提交都在跟 CI/CD 流水线较劲（是的，又一次较劲），但最终还是没能让它正常工作。

今天晚些时候，我研究了一些技术和 DeepSeek 团队一周前发布的[开源仓库](https://github.com/deepseek-ai/open-infra-index)，以及所谓的字节跳动发布的 [LLM 网关 AIBrix](https://github.com/vllm-project/aibrix)。我还在研究新发布和宣布的 Phi-4-mini 是否能够移植供 AIRI 使用，好消息是，[Phi-4-mini](https://techcommunity.microsoft.com/blog/educatordeveloperblog/welcome-to-the-new-phi-4-models---microsoft-phi-4-mini--phi-4-multimodal/4386037) 包含了函数调用能力，这意味着我们终于可以构建具有预训练支持的代理了。

## 开发直播

下午我联系了另一位艺术家，说我愿意付费定制像素艺术委托，用作我即将更新的账户头像。

~~是的，我要求艺术家在里面放一些彩蛋，哈哈，祝你们好运找到它。~~

直播的布局和设置已更新 😻 这是几乎一年前我自己设计的，但看起来仍然很棒，观看时感觉也很平静。请在聊天中留下评论提出任何建议，非常感谢。

![](./assets/live-stream-layout-update.avif)

在今天的开发直播中，我尝试将舞台过渡动画组件集成到 AIRI 网站的主舞台中，过程并不那么顺利，我在之前的动画组件设计中发现了几个问题，不过好消息是我已经修复了这些问题，新的动画过渡效果现在已经在我们的官方部署 [https://airi.moeru.ai](https://airi.moeru.ai) 上可用了。

我最终做出了决定，这源于一些关于模块配置界面和设置页面的随机想法。它们都已实现并上线，现在调整设置时应该会提供更好的感觉，希望你们喜欢。

在我结束直播后，终于在我的手机上亲自测试了结果，虽然它在桌面和平板设备上可以正常工作，但我发现不小心在移动设备上破坏了动画，明天白天会修复这个问题 😹

今天的 DevLog 就到这里，感谢所有参加 DevStream 并一直陪伴到最后的大家。明天见。
