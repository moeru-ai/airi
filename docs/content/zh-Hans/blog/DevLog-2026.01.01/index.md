---
title: DevLog @ 2026.01.01
category: DevLog
date: 2026-01-01
excerpt: |
  和大家分享 AIRI 在 iOS 平台上的进展，遇到的问题与解决方案，以及柠猫在 FlowChat 实验记忆层的一些成果和一点点实现细节。
preview-cover:
  light: "@assets('./assets/cover-light.png')"
  dark: "@assets('./assets/cover-dark.png')"
---

新年快乐！这里是 [@LemonNekoGH](https://github.com/LemonNekoGH)，AIRI 的维护者之一，新年的第一篇 DevLog 是我的了，（按下 B 键选择了大笑表情）啊哈哈哈哈哈哈！

<p style="display: flex; justify-content: center;">
    <img src="./assets/helldiver-laughing.png" alt="Helldiver Laughing Emotion" />
</p>

好的我们来到正题。

## AIRI Pocket

在两天前，我们引入了 [Capacitor](https://capacitorjs.com/) 来为 AIRI 构建移动端应用（[#845](https://github.com/moeru-ai/airi/pull/845)），我们称之为 AIRI Pocket。

目前我们把 iOS 的部分点亮了，同时为它加入了通知能力，也就是说，如果她想，她可以主动通过通知来提醒你去陪她了。

<p style="display: flex; justify-content: center;">
    <video src="./assets/airi-notification-capability.mp4" alt="AIRI Pocket Notification" controls width="230" height="500"></video>
</p>

别太在意那个 Capacitor 默认图标，之后会换的。

在视频中，我把 AIRI 从后台列表移除了，不久后 AIRI 就弹出了一条通知，这种后台通知在 PWA 中很难做到，在 iOS 原生应用上就轻而易举了。

诶，这么顺利吗，没有遇到什么问题吗？

### 不安全上下文导致的功能限制

显然是遇到了问题的，首当其冲的就是我们的 VAD 部分，由于 VAD 依赖了 `AudioWorkletNode`，这个类只有在安全上下文（Secure Context）中才能使用，而 Capacitor 的 iOS 应用在开发时需要热重载，它会直接访问你的开发环境暴露的端口，因此浏览器认为这是一个不安全的上下文，不会提供 `AudioWorkletNode` 类，导致 VAD 无法工作。

虽然在生产环境，打包之后，它会是安全的，但是我们需要在开发的时候测试它，所以这个问题必须解决。

在 AI 和搜索引擎的指引下，我找到了 `vite-plugin-mkcert` 这个插件，它可以帮助我们生成一个自签名证书，并且安装到系统中，从而让浏览器认为这是一个安全的上下文。

那这样做，解决了吗？依然没有，因为虽然证书被安装到本地的系统上了，但是没有安装到 iOS 上，所以 WKWebview 不信任这个证书，然而，如果每次 IP 变动都要重新安装证书，那也太麻烦了。

那要不直接修改原生代码，在开发阶段信任所有的证书？还真可以：

```swift
import UIKit
import Capacitor
import WebKit

class DevBridgeViewController: CAPBridgeViewController {
    #if DEBUG
    override func viewDidLoad() {
        super.viewDidLoad()
        bridge?.webView?.navigationDelegate = self
    }
    #endif
}

#if DEBUG
extension DevBridgeViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           let serverTrust = challenge.protectionSpace.serverTrust {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            completionHandler(.performDefaultHandling, nil)
        }
    }
}
#endif
```

注意这个 `#if DEBUG` 宏，这是为了在开发阶段启用，在生产环境会被优化掉，否则在生产环境会允许所有的证书，这显然是不安全的。

## 在 FlowChat 中实验的记忆层

先给大家看一下柠猫在 FlowChat 中实验的记忆层的效果：

<video src="./assets/flow-chat-basic-memory.mp4" alt="FlowChat Basic Memory" controls></video>

在视频中，我要求 LLM 记住我的名字，它生成完回复之后，在设置界面就看到它记住了，即使开了新的对话，它也能想得起来。

这是怎么做到的呢？目前的实现相当简易：

1. 创建一张记忆表。
2. 给 LLM 提供一个工具函数，在它认为需要记住什么的时候，以陈述句来概括要记住的内容，然后调用这个工具函数。
3. 在每次请求生成新的回复时，把所有的记忆拼接在系统提示词中。

如何动态拼接提示词呢？我使用了 [`@velin-dev/vue`](https://github.com/moeru-ai/velin/tree/main/packages/vue) 包，它允许我们用 Vue 来写提示词，所有 Vue 拥有的能力它都有。

`prompt.velin.md`

```markdown
<script setup lang="ts">
const props = defineProps<{
  memory: string[]
}>()
</script>

<!-- Other content -->

## Your memories

<ul>
    <li v-for="memory in props.memory">{{ memory }}</li>
</ul>

<!-- Other content -->
```

像上面这样的代码，它也是支持写 markdown 的。

不知道你有没有注意到一点，就是我在介绍步骤时，说「把所有的记忆拼接在提示词中」，当记忆越来越多，这个提示词就会变得越来越长，怎么优化呢？不知道，那也许就是下一篇 DevLog 的内容了。

## 结束

好的，今年第一篇 DevLog 就被我 ~~水~~ 写好了，希望你看得开心。

我们下一篇 DevLog 再见。

*封面图由 [Google Gemini](https://gemini.google.com/) 生成*
