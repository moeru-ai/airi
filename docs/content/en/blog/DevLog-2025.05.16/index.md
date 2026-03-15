---
title: DevLog @ 2025.05.16
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

Hello again! Here's [Neko](https://github.com/nekomeowww), the girl who started
the [Project AIRI](https://github.com/moeru-ai/airi)!

Sorry for being late for new update in
Project AIRI through the posted DevLog, please forgive us
for the delay.

> We wrote many fantastic DevLogs about our development
> progress once a while for the past months for AIRI, where
> we share out thoughts, ideas, explaining in technologies
> we use, artworks inspired from... everything.
>
> - [v0.4.0 UI update](./DevLog-2025.03.20.mdx)
> - [v0.4.0 release & memory introduced](./DevLog-2025.04.06.mdx)
>
> I wrote these two amazing and beloved DevLogs too! Hope you
> enjoy reading them.

# Dejavu

For the past few weeks, the major quests of Project AIRI itself
haven't progressed for a while, perhaps I was quite burned
out from the huge UI refactoring and release since March
2025. Most of the work was done by community maintainers,

Most profoundly appreciated to [@LemonNekoGH](https://github.com/LemonNekoGH) and
[@RainbowBird](https://github.com/luoling8192),
[@LittleSound](https://github.com/LittleSound) for their work done in the field of

- Character Card support

::: tip What is Character Card?
Well, local-first chat applications like [SillyTavern](https://github.com/SillyTavern/SillyTavern)
, [RisuAI](https://risuai.net/) or online services like [JanitorAI](https://janitorai.com/) uses、 a
file contains character's background, personality, and other role-playing essential context for
each individual characters.

- https://realm.risuai.net/
- https://aicharactercards.com/
- https://chub.ai/

Character cards aren't the only thing for storing sharing LLM driven role-playing
characters, [Lorebook](https://docs.novelai.net/text/lorebook.html) plays another key role
in this field, but this is totally another story worth to write a entire series of
documentation to share, for now, try read [Void's Lorebook Types](https://rentry.co/lorebooks-and-you) and
[AI Dynamic Storytelling Wiki](https://aids.miraheze.org/wiki/Main_Page).

> I personally love this wiki for learning these concepts:
> [AI Dynamic Storytelling Wiki](https://aids.miraheze.org/wiki/Main_Page),
> worth reading if you are interested in AI role-playing.
:::

> To use Character Card, navigate to Settings page (top right
> corner of the app, or hovering Gear icon in desktop app),
> Find and click the "Airi Card" button.

<img class="light" :src="CharacterCardMenuLight" alt="screenshot of a menu offers Airi Card menu button" />
<img class="dark" :src="CharacterCardMenuDark" alt="screenshot of a menu offers Airi Card menu button" />

> This will bring you to the "Airi Card editor screen", where you can upload and
> edit your character card for persona customization.

<img class="light" :src="CharacterCardSettingsLight" alt="screenshot of a menu offers Airi Card menu button" />
<img class="dark" :src="CharacterCardSettingsDark" alt="screenshot of a menu offers Airi Card menu button" />

For Character Card showcases, we tried some approaches too...

<img class="light" :src="CharacterCardShowcaseLight" alt="a card like user interface design for a blue hair character called ReLU" />
<img class="dark" :src="CharacterCardShowcaseDark" alt="a card like user interface design for a blue hair character called ReLU" />

It's live in our UI component library, you can play around with it: https://airi.moeru.ai/ui/#/story/src-components-menu-charactercard-story-vue .

> Pure CSS and JavaScript controlled, layout works so we don't need to worry about the canvas calculation.
>
> Oh and most of the work for the character card showcase
> was done and instructed by [@LittleSound](https://github.com/LittleSound),
> much appreciated.

- Tauri MCP support
- Connects AIRI to Android devices

These two was major update and try-out, and this part was done by [@LemonNekoGH](https://github.com/LemonNekoGH),
she wrote another two DevLogs about these things and shared the technical
details behind the scene. (Valuable for Tauri developers and users I guess.)
You can read them here:

- [Controls Android](./DevLog-2025.04.22.mdx)
- [MCP in Tauri](./DevLog-2025.04.28.md)

## Project AIRI major quests

### Ears listening, and mouth speaking

From April 15, I found both VAD (voice activation detection),
[ASR (a.k.a. automatic speech recognition)](https://huggingface.co/tasks/automatic-speech-recognition),
and [TTS (text to speech)](https://huggingface.co/tasks/text-to-speech) in AIRI
are very complex and hard to use and understand, for that time, I was cooperating
with [@himself65](https://github.com/himself65) to improve and test the use cases
for the new project from [Llama Index](https://www.llamaindex.ai/), a library
to help to process the event based stream of LLM streaming tokens, and audio
bytes, called [`llama-flow`](https://github.com/run-llama/llama-flow).

[`llama-flow`](https://github.com/run-llama/llama-flow) is really small,
and type-safe to use. In the old days without it, I have to manually wrap
another **queue** structured, and Vue's reactivity powered workflow system
to chain many asynchronous tasks together to be able to process data to power AIRI.

That was the time I started to experiment more examples, demos on simplifying VAD,
ASR, TTS workflow.

Eventually, I got this:
[WebAI Realtime Voice Chat Examples](https://github.com/proj-airi/webai-example-realtime-voice-chat),
which I managed to proof the work can be done on Web browser within one single
300 ~ 500 lines of TypeScript code to achieve ChatGPT voice chat system.

<ThemedVideo controls muted src="./assets/webai-examples-demo.MP4" style="height: 640px;" />

I tried my best to split all the possible steps into small and reusable pieces
to help demonstrate how you can construct a real-time voice chat system
from ground up and scratch:

- [VAD](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad)
- [VAD + ASR](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr)
- [VAD + ASR + LLM Chat](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr-chat)
- [VAD + ASR + LLM Chat + TTS](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr-chat-tts)

> Hope you could learn some from them.

During this time, we discovered a interesting and powerful repository though,
called [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), it supports
18 tasks of speech processing across macOS, Windows, Linux, Android,
iOS, etc. over 12 languages. Fascinating!

So [@luoling](https://github.com/luoling8192) made another small demo for this too:
[Sherpa ONNX powered VAD + ASR + LLM Chat + TTS](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/main/apps/sherpa-onnx-demo)

#### Birth of xsAI 🤗 Transformers.js

Because the work we have done for VAD, ASR, Chat, and TTS demos, this gave the
birth of a new side project called [xsAI 🤗 Transformers.js](https://github.com/proj-airi/xsai-transformers)
, enabling the simplicity to call the WebGPU powered model inference and serving with
workers while still keeping the API compatible to our prior succeeded project called
[xsAI](https://github.com/moeru-ai/xsai).

We got a playground for that too... play it on [https://xsai-transformers.netlify.app](https://xsai-transformers.netlify.app).

You can install it via npm today!

```bash
npm install xsai-transformers
```

::: tip What does this mean?
This means you can swap between cloud LLM and speech providers and local WebGPU
powered models with one if switch.

This brought us a new possibility to be able to experiment and even achieve
simple RAG and re-ranking system right in the browser, without the need of
any server side code, or even a backend server.

Oh, Node.js was supported, too!
:::

### Telegram Bot

I added the support of Telegram bot to be able to process animated stickers,
powered by `ffmpeg` (what else, obviously).
It now can read and understand the animated stickers and even videos sent
by users.

The system prompt was way too huge, I managed to reduce the size of the
system prompt drastically to save more than **80%** of the token usage.

### Character Card showcase

Many image assets requires me to manually find a suitable and easy to use
online solutions to remove backgrounds, but I decided to make my on based
on the work that [Xenova](https://github.com/xenova) have done... to make
one for my own.

I did some small experiments on integrating a WebGPU powered background
remover right in the system, you can play around with it here in
[https://airi.moeru.ai/devtools/background-remove](https://airi.moeru.ai/devtools/background-remove).

### xsAI & unSpeech

We added support for Alibaba Cloud Model Studio and Volcano Engine as speech
provider, quite useful I guess?

### UI

- New [Tutorial stepper](https://airi.moeru.ai/ui/#/story/src-components-misc-steppers-steppers-story-vue?variantId=src-components-misc-steppers-steppers-story-vue-0), [File upload](https://airi.moeru.ai/ui/#/story/src-components-form-input-inputfile-story-vue?variantId=default), and [Textarea](https://airi.moeru.ai/ui/#/story/src-components-form-textarea-textarea-story-vue?variantId=default) component
- Color issues
- [Typography improved](https://airi.moeru.ai/ui/#/story/stories-typographysans-story-vue?)

More of the stories can be found at [Roadmap v0.5](https://github.com/moeru-ai/airi/issues/113)

## Side-quests

### [Velin](https://github.com/luoling8192/velin)

Since we got the Character Card supported, the feeling wasn't so good and
smooth when dealing with template variable rendering, and component reusing...

What if...

- We could maintain a component prompt library that can be used for other agent or role-playing applications, or even character cards?
  - For example:
    - having a medieval fantasy background settings for magic and dragons
    - the only thing we need to do is to focus our writing on our new character when wrap the world settings outside of it
    - perhaps, only when the time goes to night, special prompts will get injected through `if` and `if-else` control flow
  - We can do more things around it...
    - with Vue SFC or React JSX, we can parse the template and identify the props, render a form panel for debugging and testing while writing prompts
    - visualize the entire lorebook and character card in a single interactive page

So why don't we make a tool to write LLM prompts with frontend frameworks like Vue or React, and maybe extend this beyond to other frameworks and platforms?

This is what we got: [**Velin**](https://github.com/luoling8192/velin).

<img class="light" :src="VelinLight" alt="tool to write LLM prompts with Vue.js" />
<img class="dark" :src="VelinDark" alt="tool to write LLM prompts with Vue.js" />

We even made a playground for editing it and render it on-the-fly,
while enjoying the ecosystem of npm packages (yes you can import any!).

<img class="light" :src="VelinPlaygroundLight" alt="tool to write LLM prompts with Vue.js" />
<img class="dark" :src="VelinPlaygroundDark" alt="tool to write LLM prompts with Vue.js" />

Try it here: https://velin-dev.netlify.app

Programmatic API supported too, Markdown (MDX WIP, MDC supported),
you can install it via npm today!

```bash
npm install @velin-dev/core
```

Well... that's all for today, I hope you enjoy reading this DevLog.

Let's end with DevLog with more images from the recent event we attended in Hangzhou, China: The **Demo Day @ Hangzhou**.

<img :src="DemoDayHangzhou1" alt="Demo Day @ Hangzhou" />

This is me, I shared the AIRI project with other attendees, and we had a great time
there! Meet so many of the talented developers, product designers, and entrepreneurs.

Introduced almost everything I shared today in this DevLog, and also the beloved AI VTuber Neuro-sama.

The slides I used to share was this:

<img :src="DemoDayHangzhou2" alt="Demo Day @ Hangzhou" />
<img :src="DemoDayHangzhou3" alt="Demo Day @ Hangzhou" />

The slides itself is purely open sourced, you can play around
it here too: [https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1](https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1)

## Milestones

Oh... and since this DevLog also indicates the release of v0.5.0,
I would love to mention some of the milestone we reached in the past few weeks:

- We reached the 700 stars!
- 4+ new fresh contributors in issues!
- 72+ new fresh group members in Discord server!
- ReLU character design finished!
- ReLU character modeling finished!
- Negotiated with a few companies for sponsorships, and cooperation!
- 92 tasks finished for [Roadmap v0.5](https://github.com/moeru-ai/airi/issues/113)
  - UI
    - Loading screen and tutorial modules
    - Multiple bug fixes including loading states and Firefox compatibility issues
  - Body
    - Motion embedding and RAG from semantic, developed in private repo "moeru-ai/motion-gen"
    - Vector storage and retrieval using embedding providers and DuckDB WASM
  - Inputs
    - Fixed Discord Voice Channel speech recognition
  - Outputs
    - Experimental singing capabilities
  - Engineering
    - Shared UnoCSS configuration across projects
    - Model catalog in "moeru-ai/inventory"
    - Package reorganization across organizations
  - Assets
    - New character assets including stickers, UI elements, VTuber logos
    - Voice line selection functionality
    - Live2D modeling for characters "Me" and "ReLU"
  - Community Support & Marketing
    - Japanese README
    - Plausible analytics integration
    - Comprehensive documentation

See you!
