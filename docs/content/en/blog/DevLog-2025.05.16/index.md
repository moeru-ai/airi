---
title: DevLog @ 2025.05.16
category: DevLog
date: 2025-05-16
---


<script setup>
</script>


Hello everyone! I am [Neko](https://github.com/nekomeowww), the founder of [Project AIRI](https://github.com/moeru-ai/airi)!


Sorry for the delay in updating Project AIRI's DevLog; please forgive our procrastination.


> Over the past few months, we have written many wonderful DevLogs for AIRI, sharing our development progress, ideas, philosophies, the technologies we use, and the artistic inspiration we drew from... everything.
>
> - [v0.4.0 UI update](./DevLog-2025.03.20.mdx)
> - [v0.4.0 release & memory feature introduction](./DevLog-2025.04.06.mdx)
>
> I also wrote these two wonderful and popular DevLogs! I hope you enjoy reading them.


# Deja Vu


Over the past few weeks, the main tasks of Project AIRI itself have not progressed for a while; maybe I was a bit exhausted after the large-scale UI refactor and release since March 2025. Most of the work has been done by community maintainers.


Many thanks to [@LemonNekoGH](https://github.com/LemonNekoGH), [@RainbowBird](https://github.com/luoling8192), and [@LittleSound](https://github.com/LittleSound) for their work in the following areas:


- Character card support


::: tip What is a character card?


Local-first chat applications like [SillyTavern](https://github.com/SillyTavern/SillyTavern) and [RisuAI](https://risuai.net/), or online services like [JanitorAI](https://janitorai.com/), use a file containing the character's background, personality, and other roleplay-necessary context to define each individual character.


- https://realm.risuai.net/
- https://aicharactercards.com/
- https://chub.ai/


Character cards are not the only way to store and share LLM-driven roleplay characters. [Lorebooks](https://docs.novelai.net/text/lorebook.html) play another key role in this field, but that is entirely another story worth a whole documentation series. For now, try reading [Void's Lorebook Types](https://rentry.co/lorebooks-and-you) and the [AI Dynamic Storytelling Wiki](https://aids.miraheze.org/wiki/Main_Page).


> I personally love this wiki for learning these concepts: [AI Dynamic Storytelling Wiki](https://aids.miraheze.org/wiki/Main_Page). If you are interested in AI roleplay, it is worth a read.


:::


> To use a character card, navigate to the settings page (top right of the application, or hover the gear icon in the desktop application), find and click the "Airi Card" button.

<img class="light" src="/blog/DevLog-2025.05.16/assets/character-card-menu-light.avif" alt="A screenshot of the menu with the Airi Card menu button" />

<img class="dark" src="/blog/DevLog-2025.05.16/assets/character-card-menu-dark.avif" alt="A screenshot of the menu with the Airi Card menu button" />

> This will take you to the "Airi Card editor interface", where you can upload and edit your character card for persona customization.

<img class="light" src="/blog/DevLog-2025.05.16/assets/character-card-settings-light.avif" alt="A screenshot of the menu with the Airi Card menu button" />

<img class="dark" src="/blog/DevLog-2025.05.16/assets/character-card-settings-dark.avif" alt="A screenshot of the menu with the Airi Card menu button" />


For character card showcase, we also tried some approaches...


<img class="light" src="/blog/DevLog-2025.05.16/assets/character-card-showcase-light.avif" alt="A card-style UI design of a blue-haired character named ReLU" />

<img class="dark" src="/blog/DevLog-2025.05.16/assets/character-card-showcase-dark.avif" alt="A card-style UI design of a blue-haired character named ReLU" />


It is live in our UI component library; you can play with it here: https://airi.moeru.ai/ui/#/story/src-components-menu-charactercard-story-vue .


> Pure CSS and JavaScript control, with a working layout, so we do not need to worry about canvas computation.
>
> Oh, most of the work on the character card showcase was done and guided by [@LittleSound](https://github.com/LittleSound). Thank you very much.


- Tauri MCP support
- Connecting AIRI to Android devices


These two are the major updates and attempts. This part of the work was done by [@LemonNekoGH](https://github.com/LemonNekoGH), who wrote two other DevLogs sharing the technical details behind the scenes. (I think they will be valuable to Tauri developers and users.) You can read them here:


- [Controlling Android](./DevLog-2025.04.22.mdx)
- [MCP in Tauri](./DevLog-2025.04.28.md)


## Project AIRI Main Tasks


### Ears Listening, Mouth Speaking


Starting April 15, I found that the VAD (voice activity detection), [ASR (automatic speech recognition)](https://huggingface.co/tasks/automatic-speech-recognition), and [TTS (text-to-speech)](https://huggingface.co/tasks/text-to-speech) in AIRI were all quite complex and hard to use and understand. At that time, I was working with [@himself65](https://github.com/himself65) to improve and test the use cases of a new project from [Llama Index](https://www.llamaindex.ai/), a library for handling event-based LLM streaming token streams and audio bytes, called [`llama-flow`](https://github.com/run-llama/llama-flow).


[`llama-flow`](https://github.com/run-llama/llama-flow) is really small and type-safe to use. In the old days without it, I had to manually wrap another **queue** structure, along with Vue's reactivity-driven workflow system, chaining many async tasks together to process data to drive AIRI.


At that time, I started experimenting with more examples and simplifying the VAD, ASR, and TTS workflow demos.


Eventually I got this: [WebAI real-time voice chat example](https://github.com/proj-airi/webai-example-realtime-voice-chat). I managed to prove that this work could implement a ChatGPT voice chat system in a web browser with only 300~500 lines of TypeScript.


<ThemedVideo controls muted src="/blog/DevLog-2025.05.16/assets/webai-examples-demo.MP4" style="height: 640px;" />


I tried my best to break down all the possible steps into small reusable pieces to help demonstrate how to build a real-time voice chat system from scratch:


- [VAD](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad)
- [VAD + ASR](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr)
- [VAD + ASR + LLM chat](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr-chat)
- [VAD + ASR + LLM chat + TTS](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr-chat-tts)


> I hope you can learn something from it.


During this period, we discovered an interesting and powerful repository called [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), which supports 18 speech processing tasks in 12 languages across macOS, Windows, Linux, Android, iOS, and more. Fascinating!


So [@luoling](https://github.com/luoling8192) also made another small demo for it: [Sherpa ONNX powered VAD + ASR + LLM chat + TTS](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/main/apps/sherpa-onnx-demo)


#### The Birth of xsAI 🤗 Transformers.js


Thanks to our work on the VAD, ASR, chat, and TTS demos, a new side project called [xsAI 🤗 Transformers.js](https://github.com/proj-airi/xsai-transformers) was born. It simplifies calling WebGPU-driven model inference and serving with workers, while still keeping API compatibility with our previous successful project [xsAI](https://github.com/moeru-ai/xsai).


We also made a playground for it... play around at [https://xsai-transformers.netlify.app](https://xsai-transformers.netlify.app).


You can install it via npm today!

```bash
npm install xsai-transformers
```


::: tip What does this mean?


It means you can switch between cloud LLM and speech providers and local WebGPU-driven models with an if toggle.


This opens up a new possibility for us: experimenting with and even implementing simple RAG and reranking systems in the browser, without any server-side code, or even a backend server.


Oh, Node.js is supported too!


:::


### Telegram Bot


I added Telegram bot support that can handle animated stickers, powered by `ffmpeg` (what else, obviously). Now it can read and understand animated stickers and even videos sent by users.


The system prompt was too big; I managed to dramatically reduce its size, saving more than **80%** of token usage.


### Character Card Showcase


Many image resources required me to manually find suitable and easy-to-use online solutions to remove backgrounds, but I decided to make one for myself based on the work done by [Xenova](https://github.com/xenova)...


I did some small experiments integrating a WebGPU-driven background remover into the system. You can play with it at [https://airi.moeru.ai/devtools/background-remove](https://airi.moeru.ai/devtools/background-remove).


### xsAI & unSpeech


We added support for Alibaba Cloud Model Studio and Volcengine as speech providers. I think it will be useful?


### UI


- New [tutorial stepper](https://airi.moeru.ai/ui/#/story/src-components-misc-steppers-steppers-story-vue?variantId=src-components-misc-steppers-steppers-story-vue-0), [file upload](https://airi.moeru.ai/ui/#/story/src-components-form-input-inputfile-story-vue?variantId=default), and [textarea](https://airi.moeru.ai/ui/#/story/src-components-form-textarea-textarea-story-vue?variantId=default) components
- Color issues
- [Typography improvements](https://airi.moeru.ai/ui/#/story/stories-typographysans-story-vue?)


More stories can be found in [Roadmap v0.5](https://github.com/moeru-ai/airi/issues/113)


## Side Tasks


### [Velin](https://github.com/luoling8192/velin)


Ever since we supported character cards, handling template variable rendering and component reuse has not felt good and smooth...


What if...


- We could maintain a component prompt library that could be used for other agent or roleplay applications, or even character cards?
  - For example:
    - Have a medieval fantasy setting for magic and dragons
    - The only thing we need to do is focus on writing our new character when wrapping the world setting around it
    - Maybe, only when it becomes nighttime, special prompts would be injected through `if` and `if-else` control flows
  - We can do more around it...
    - Using Vue SFC or React JSX, we can parse templates and identify props, rendering a form panel for debugging and testing while writing prompts
    - Visualize the entire lorebook and character card in a single interactive page


Then why don't we make a tool for writing LLM prompts with frontend frameworks like Vue or React, maybe extending this to other frameworks and platforms?


That is what we got: [**Velin**](https://github.com/luoling8192/velin).


<img class="light" src="/blog/DevLog-2025.05.16/assets/velin-light.avif" alt="A tool for writing LLM prompts with Vue.js" />

<img class="dark" src="/blog/DevLog-2025.05.16/assets/velin-dark.avif" alt="A tool for writing LLM prompts with Vue.js" />


We even made a playground for editing and live rendering, while enjoying the npm package ecosystem (yes, you can import any package!).


<img class="light" src="/blog/DevLog-2025.05.16/assets/velin-playground-light.avif" alt="A tool for writing LLM prompts with Vue.js" />

<img class="dark" src="/blog/DevLog-2025.05.16/assets/velin-playground-dark.avif" alt="A tool for writing LLM prompts with Vue.js" />


Try it here: https://velin-dev.netlify.app


It also supports a programming API, and Markdown (MDX is in development, with MDC support). You can install it via npm today!

```bash
npm install @velin-dev/core
```


Well... that's it for today. I hope you enjoyed reading this DevLog.


Let's end the DevLog with more pictures from the event we recently attended in Hangzhou, China: **Demo Day @ Hangzhou**.


<img src="/blog/DevLog-2025.05.16/assets/demo-day-hangzhou-1.avif" alt="Demo Day @ Hangzhou" />


This is me. I shared the AIRI project with other participants, and we had a wonderful time there! We met many talented developers, product designers, and entrepreneurs.


I presented almost everything I shared in this DevLog today, plus the much-loved AI VTuber Neuro-sama.


The slides I used for sharing looked like this:


<img src="/blog/DevLog-2025.05.16/assets/demo-day-hangzhou-2.avif" alt="Demo Day @ Hangzhou" />

<img src="/blog/DevLog-2025.05.16/assets/demo-day-hangzhou-3.avif" alt="Demo Day @ Hangzhou" />


The slides themselves are fully open source; you can also play with them here: [https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1](https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1)


## Milestones


Oh... since this DevLog also marks the release of v0.5.0, I want to mention some milestones we reached over the past few weeks:


- We reached 700 stars!
- 4+ new issue contributors!
- 72+ new group members in the Discord server!
- ReLU character design completed!
- ReLU character modeling completed!
- Negotiated sponsorships and collaborations with several companies!
- [Roadmap v0.5](https://github.com/moeru-ai/airi/issues/113) completed 92 tasks
  - UI
    - Loading screen and tutorial modules
    - Multiple bug fixes, including loading states and Firefox compatibility issues
  - Body
    - Motion embedding and RAG from semantics, developed in the private repository "moeru-ai/motion-gen"
    - Vector storage and retrieval with embedding providers and DuckDB WASM
  - Input
    - Fixed speech recognition in Discord voice channels
  - Output
    - Experimental singing feature
  - Engineering
    - Shared UnoCSS config across projects
    - Model catalog in "moeru-ai/inventory"
    - Cross-organization package reorganization
  - Assets
    - New character assets, including stickers, UI elements, VTuber logos
    - Voice line selection feature
    - Live2D modeling for characters "Me" and "ReLU"
  - Community support and marketing
    - Japanese README
    - Comprehensive documentation


Goodbye!

