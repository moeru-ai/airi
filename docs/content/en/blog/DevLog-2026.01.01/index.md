---
title: DevLog @ 2026.01.01
category: DevLog
date: 2026-01-01
excerpt: |
  Sharing AIRI's progress on iOS, the problems encountered and their solutions, and some results and a bit of implementation detail from LemonNeko's memory layer experiments in FlowChat.
preview-cover:
  light: "/blog/DevLog-2026.01.01/assets/cover-light.png"
  dark: "/blog/DevLog-2026.01.01/assets/cover-dark.png"
---


Happy New Year! This is [@LemonNekoGH](https://github.com/LemonNekoGH), one of the maintainers of AIRI. The first DevLog of the new year is mine, (pressed B to select the laughing emote) ahahahahaha!


<p style="display: flex; justify-content: center;">
    <img src="/blog/DevLog-2026.01.01/assets/helldiver-laughing.png" alt="Helldiver Laughing Emotion" />
</p>


Okay, let's get to the point.


## AIRI Pocket


Two days ago, we introduced [Capacitor](https://capacitorjs.com/) to build the mobile application for AIRI ([#845](https://github.com/moeru-ai/airi/pull/845)), which we call AIRI Pocket.


Currently, we have lit up the iOS part and added notification capability to it. That is to say, if she wants to, she can proactively remind you to come and keep her company through notifications.


<p style="display: flex; justify-content: center;">
    <video src="/blog/DevLog-2026.01.01/assets/airi-notification-capability.mp4" alt="AIRI Pocket Notification" controls width="230" height="500"></video>
</p>


Don't mind the default Capacitor icon too much; it will be replaced later.


In the video, I removed AIRI from the background app list, and shortly after, AIRI popped up a notification. Such background notifications are hard to achieve in a PWA, but are effortless in a native iOS application.


Huh, so smooth? No problems encountered?


### Feature Restrictions Caused by Insecure Context


Obviously, there were problems. The first to be hit was our VAD part. Since VAD depends on `AudioWorkletNode`, which can only be used in a Secure Context, and Capacitor's iOS app needs hot reload during development — it directly accesses the port exposed by your development environment, so the browser considers it an insecure context and does not provide the `AudioWorkletNode` class, causing VAD to fail.


Although in production, after packaging, it will be secure, we still need to test it during development, so this problem must be solved.


Guided by AI and search engines, I found the `vite-plugin-mkcert` plugin, which can help us generate a self-signed certificate and install it into the system, so the browser considers it a secure context.


Did that solve it? Still no. Because although the certificate was installed on the local system, it was not installed on iOS, so WKWebView does not trust it. However, if we have to reinstall the certificate every time the IP changes, that is too troublesome.


What about directly modifying the native code to trust all certificates during development? That actually works:

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


Note the `#if DEBUG` macro: it is enabled during development and optimized away in production. Otherwise, in production it would trust all certificates, which is obviously insecure.


## The Memory Layer Experimented in FlowChat


First, let me show you the effect of LemonNeko's memory layer experiment in FlowChat:


<video src="/blog/DevLog-2026.01.01/assets/flow-chat-basic-memory.mp4" alt="FlowChat Basic Memory" controls></video>


In the video, I asked the LLM to remember my name. After it generated a reply, I could see in the settings interface that it had remembered it, and even when opening a new conversation, it could still recall it.


How is this done? The current implementation is quite simple:


1. Create a memory table.
2. Provide a tool function to the LLM; when it thinks it needs to remember something, it summarizes what to remember as a declarative sentence and calls this tool function.
3. When generating a new reply for each request, concatenate all memories into the system prompt.


How to dynamically assemble the prompt? I used the [`@velin-dev/vue`](https://github.com/moeru-ai/velin/tree/main/packages/vue) package, which lets us write prompts with Vue — everything Vue can do, it can do.


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


Code like the above also supports writing markdown.


Did you notice one thing: when introducing the steps, I said "concatenate all memories into the prompt". As memories grow, this prompt gets longer and longer. How to optimize? I don't know — maybe that will be the content of the next DevLog.


## Ending


Okay, this year's first DevLog has been ~~watered down~~ written by me. I hope you enjoyed reading it.


See you in the next DevLog.


*Cover image generated by [Google Gemini](https://gemini.google.com/)*

