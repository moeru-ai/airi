---
title: DevLog @ 2026.01.01
category: DevLog
date: 2026-01-01
excerpt: |
  Sharing AIRI's progress on the iOS platform, the problems we encountered and their solutions, as well as some achievements and implementation details of the memory layer experiments in FlowChat by LemonNeko.
preview-cover:
  light: "@assets('./assets/cover-light.png')"
  dark: "@assets('./assets/cover-dark.png')"
---

::: info AI Translation
This article was translated from Chinese to English using AI. The original Chinese version is available [here](../zh-Hans/blog/DevLog-2026.01.01/). If you notice any translation issues, please feel free to open an issue or submit a pull request.
:::

Happy New Year! This is [@LemonNekoGH](https://github.com/LemonNekoGH), one of AIRI's maintainers. The first DevLog of the new year is mine, (pressing B key to select laughing emoji) hahahahaha!

<p style="display: flex; justify-content: center;">
    <img src="./assets/helldiver-laughing.png" alt="Helldiver Laughing Emotion" />
</p>

Alright, let's get to the point.

## AIRI Pocket

Two days ago, we introduced [Capacitor](https://capacitorjs.com/) to build mobile applications for AIRI ([#845](https://github.com/moeru-ai/airi/pull/845)), which we call AIRI Pocket.

We got iOS working and added notification capabilities to it. This means that if she wants to, she can proactively remind you to spend time with her through notifications.

<p style="display: flex; justify-content: center;">
    <video src="./assets/airi-notification-capability.mp4" alt="AIRI Pocket Notification" controls width="230" height="500"></video>
</p>

Don't worry too much about that default Capacitor icon—we'll replace it later.

In the video, I removed AIRI from the background app list, and shortly after, AIRI popped up a notification. This kind of background notification is hard to achieve in PWAs, but it's a breeze on native iOS apps.

Wait, was it that smooth? Didn't we encounter any problems?

### Feature Limitations Due to Insecure Context

Obviously, we ran into problems. First up was our VAD (Voice Activity Detection) component. Since VAD relies on `AudioWorkletNode`, this class can only be used in a secure context. However, Capacitor's iOS app needs hot reload during development, which directly accesses the port exposed by your development environment. As a result, the browser considers this an insecure context and won't provide the `AudioWorkletNode` class, causing VAD to fail.

Although it will be secure in production after packaging, we need to test it during development, so this problem must be solved.

With help from AI and search engines, I found the `vite-plugin-mkcert` plugin, which can help us generate a self-signed certificate and install it on the system, making the browser think it's a secure context.

Did that solve it? Not quite. Although the certificate was installed on the local system, it wasn't installed on iOS, so WKWebView doesn't trust this certificate. However, if we had to reinstall the certificate every time the IP changes, that would be too troublesome.

What if we directly modify the native code to trust all certificates during development? Turns out it works:

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

Note the `#if DEBUG` macro—this is to enable it during development, and it will be optimized away in production. Otherwise, it would allow all certificates in production, which is obviously insecure.

## Memory Layer Experiments in FlowChat

Let me show you the results of LemonNeko's memory layer experiments in FlowChat:

<video src="./assets/flow-chat-basic-memory.mp4" alt="FlowChat Basic Memory" controls></video>

In the video, I asked the LLM to remember my name. After it generated its reply, I could see in the settings interface that it remembered, and even when I started a new conversation, it could still recall it.

How is this achieved? The current implementation is quite simple:

1. Create a memory table.
2. Provide the LLM with a tool function. When it determines something needs to be remembered, it summarizes what to remember in a declarative sentence, then calls this tool function.
3. When requesting a new reply each time, concatenate all memories into the system prompt.

How do we dynamically concatenate prompts? I used the [`@velin-dev/vue`](https://github.com/moeru-ai/velin/tree/main/packages/vue) package, which allows us to write prompts using Vue, with all the capabilities Vue has.

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

The code above also supports writing markdown.

I wonder if you noticed something—when I introduced the steps, I said "concatenate all memories into the prompt." As memories grow, this prompt will become longer and longer. How do we optimize it? I don't know, maybe that will be the content of the next DevLog.

## Conclusion

Alright, the first DevLog of this year has been ~~phoned in~~ written by me. I hope you enjoyed reading it.

See you in the next DevLog.

*Cover image generated by [Google Gemini](https://gemini.google.com/)*
