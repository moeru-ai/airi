---
title: DevLog @ 2025.10.20
category: DevLog
date: 2025-10-20
excerpt: |
  Sharing the latest progress of the AIRI project: the migration from Tauri to Electron, a new Live2D model, and updates across various open-source projects.
preview-cover:
# TODO
---


AI-driven crypto trading is really hot these days, and we have similar research to share. Let's start with development...


## From Tauri to Electron


Tauri became popular again a couple of days ago. We first tried it back in March, and because we liked the plugin design, we wrapped many crates around it. Although we finally released v0.7.2 in June, later, to implement the voice chat feature everyone wanted, we spent another 3 months wrestling with the WebKit used by Tauri plus the extremely hard-to-use Web Audio API and DevTools... 3 months... until September...


...In the end, we could not hold it in anymore, and during the National Day holiday we completely switched to Electron.


<img src="/blog/DevLog-2025.10.20/assets/electron.png" alt="electron.png" />


Now Electron, on top of the original features, has Linux support and what we call the Control Island. It can even overlay on the interface when the window is full screen on macOS.


The compatibility is great — the kid really likes it. Yesterday we finally also got the caption overlay, so we can have captions showing what the AI outputs, just like Neuro-sama.


<img src="/blog/DevLog-2025.10.20/assets/control-island.png" alt="control-island.png" />

<div style="text-align: center; font-size: 0.875rem; color: #666; margin-top: 0.5rem;">
Control Island
</div>


## New Live2D Model


Sharp-eyed friends may have noticed that our model has been updated! Yes, it has been updated! I love the current model very much (sadly, we still do not want to put this model directly in the open-source repository).


This model was fortunately improved in collaboration with an artist who has also worked with the official Neuro-sama, plus a very skilled modeler. The new animated expressions are also very rich.


(whisper) Maybe if we get more sponsors, we will be willing to (x


<video src="/blog/DevLog-2025.10.20/assets/airi.mp4" alt="airi.mp4" controls playsinline></video>


## Three.js MMD Support


The models you have or can find are not necessarily Live2D/VRM models; the most abundant and best models are probably still MMD ones.


Our 3D rendering is also based on Three.js. However, the current situation is that there is no properly working MMD implementation in the Three.js ecosystem. Thanks to kwaa's work, we now have a repository for this.


If you are also interested, [come and maintain it together!](https://github.com/moeru-ai/three-mmd)


## Velin: Writing Prompts with Vue


> "You can write prompts with [Vue](https://velin-dev.netlify.app/#/)!"


Remember the prompt library we shared in May? Thanks to RainbowBird's efforts and contributions, Velin is now part of Moeru AI, and almost all of AIRI's prompts are driven by Velin. But don't worry about cross-platform capability — Velin also works in the Node.js environment!


<img src="/blog/DevLog-2025.10.20/assets/velin.png" alt="velin.png" />


## Eventa: Event-driven IPC/RPC


> "Events are all you need"


We once shared [Netlify](https://velin-dev.netlify.app/#/), a project that allows pure local inference in the browser in a way similar to the Vercel AI SDK.


These local inferences can only be implemented in Web Workers / worker_threads, and they all communicate via events; Electron IPC works the same way. But we felt that was not elegant enough. Thanks again to RainbowBird, the library for driving and implementing event-based IPC/RPC, [Eventa](https://github.com/moeru-ai/eventa), is now also part of Moeru AI.


## Current State of the Project


Moeru AI and Project AIRI are now very large organizations, with more than 50 original repositories covering machine learning, data processing, frontend, and backend, in languages such as TypeScript/Python/Rust/Go.


Together, we have more than 800 followers. This was unimaginable when we were founded a year ago. We truly thank everyone for the love.


<img src="/blog/DevLog-2025.10.20/assets/moeru.png" alt="moeru.png" />

<div style="text-align: center; font-size: 0.875rem; color: #666; margin-top: 0.5rem;">
Moeru AI
</div>

<img src="/blog/DevLog-2025.10.20/assets/project-airi.png" alt="project-airi.png" />

<div style="text-align: center; font-size: 0.875rem; color: #666; margin-top: 0.5rem;">
Project AIRI
</div>


## Pure Rust TTS Implementation


Small teaser: recently, together with kwaa, I ported the well-known TTS model chatterbox to a pure Rust implementation, so we no longer have to worry about Python environment setup issues.


On a 4080S, it infers about once every 5 seconds — I like it very much.


It is almost a 1:1 implementation of the Python model architecture in Rust. I hope to turn it into a very lean local TTS inference engine built on other SOTA TTS models.


<img src="/blog/DevLog-2025.10.20/assets/rust-tts.png" alt="rust-tts.png" />


## Finally


That's it for today's "one more thing". I hope you like such a long thread, one item after another.


We will continue updating tomorrow, bringing you lots of great content, introducing our explorations in VLA / VLM gaming — what we did, how we did it, and how it worked.

