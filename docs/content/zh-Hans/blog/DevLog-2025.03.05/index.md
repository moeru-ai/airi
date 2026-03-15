---
title: 开发日志 @ 2025.03.05
category: DevLog
date: 2025-03-05
---

## 似曾相识

昨天我新增了一个名为 [`gpuu` (GPU 工具)](https://github.com/moeru-ai/gpuu) 的包，
用于帮助我们处理 WebGPU 相关功能，未来或许还能用它来与真实的 GPU 设备交互。
目前这个包的功能还比较有限，我们会在后续版本中为其增加更多能力。

使用方式如下：

```ts
import { check } from 'gpuu/webgpu'
import { onMounted } from 'vue'

onMounted(async () => {
  const result = await check()
  console.info(result)

  // 对结果进行一些操作
})
```

上周，我们的企业设计师/艺术家提交了 Project AIRI 标志的第一版设计稿。
标志的整体风格看起来是这样的：

![](./assets/airi-logos-v1.avif)

## 日间工作

从设计角度来看，这些标志在缩放到主屏幕应用大小时显得过于复杂且不够友好。
因此我重新设计了这个版本：

![](./assets/airi-logo-v2.avif)

并编辑了其他变体：

![](./assets/airi-logos-v2.avif)

不过这些版本都只适合深色主题，"我们还需要一个浅色主题的版本！"想到这里，我立即着手制作了这个：

![](./assets/airi-logo-v2-dark.avif)

[@kwaa](https://github.com/kwaa) 建议我们可以尝试为两个主题互换配色方案：

![](./assets/airi-logos-v3.avif)

这确实看起来更好。

我们也更新了字体排版：

![](./assets/airi-logos-v4.avif)

并优化了背景颜色：

![](./assets/airi-logos-v5.avif)

所以这就是我们最终得到的：

![](./assets/airi-logos-final.avif)

今天晚些时候，我将 Project AIRI 的[文档网站](https://airi.build)正式上线，
为我自己以及其他开发者和艺术家提供参考和指南。

终于完成了！新设计的标志和配色方案都已经整合到[文档网站](https://airi.build)中：

![](./assets/airi-build-light.avif)
![](./assets/airi-build-dark.avif)

现在网站已经包含了[基础指南](../guides/)、
[贡献指南](../references/contributing/guide/)
以及[设计指南](../references/design-guidelines/)。

我花了整个中午的时间研究 YouTube 上的文字 PV 动画效果，
对这些动画非常着迷，希望能在浏览器中实现类似的过渡效果！

https://www.youtube.com/watch?v=_AIgv0EsOE4

幸运的是，我认识一位在这方面非常出色的开发者和艺术家：
[yui540](https://github.com/yui540)（个人网站：[yui540.com](https://yui540.com)），
他/她刚刚发布了一个全新的仓库来展示那些精彩的过渡效果实现。

我已经将这些相关资源和网站链接都添加到了 [https://airi.build](https://airi.build) 网站，欢迎大家前去查看。

## 开发直播

我将 [yui540](https://github.com/yui540) [仓库](https://github.com/yui540/css-animations) 中的
许多动画过渡效果移植到了 [https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/)。

移植后的效果相当不错：

![](./assets/animation-transitions.gif)

今天的 DevLog 就到这里，感谢所有参加 DevStream 并一直陪伴到最后的大家。明天见。
