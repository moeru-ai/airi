---
title: DevLog @ 2025.03.20
category: DevLog
date: 2025-03-20
---


<script setup>
</script>


Long time no see! It has been 10 days since the last DevLog.


We made a lot of improvements to the user interface to integrate more LLM providers and speech providers, and for the first time released AIRI on Discord, bilibili, and many other social media platforms.


There is still a lot we cannot wait to tell you about.


## Deja Vu


Let's turn the clock back a bit!


<img src="/blog/DevLog-2025.03.20/assets/steins-gate-gelnana-from-elpsycongrooblog.avif" alt="Gelbana" />

> Ah, don't worry, our beloved [AIRI](https://github.com/moeru-ai/airi) won't become a GEL-NANA like this. But if you haven't watched the [_Steins;Gate_](https://myanimelist.net/anime/9253/Steins_Gate) anime series yet, we highly recommend giving it a try~!


We have been working on the initial setup UI design, the animations were improved, and 10 days ago we implemented customizable theme coloring. It has indeed been a busy week for any of us (especially since we are all part-time contributors to this project, haha. If you would like, you are welcome to join us. 🥺 (pleading face)).


This is the final result we got at the time:


<img class="light" src="/blog/DevLog-2025.03.10/assets/new-ui-v3.avif" alt="new ui" />

<img class="dark" src="/blog/DevLog-2025.03.10/assets/new-ui-v3-dark.avif" alt="new ui" />

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


~~Welcome to the β worldline.~~


Since we now have colored cards for model radio groups and nav items, as well as customizable themes, it is clear that debugging UI components in the business workflow would definitely become difficult, which would visibly slow down our development.


That is why we decided to introduce the amazing tool called [`Histoire`](https://histoire.dev), which is basically a [Storybook](https://storybook.js.org/), but more native to the [Vite](https://vitejs.dev) and [Vue.js](https://vuejs.org) stack.


This is the first look recorded by [@sumimakito](https://github.com/sumimakito) after finishing it:


<ThemedVideo muted autoplay src="/blog/DevLog-2025.03.20/assets/histoire-first-look.mp4" />


The entire OKLCH palette can be expanded onto the canvas at once for our reference. But a scheme for trying colors and getting the same feel as the Project AIRI theme was not perfect, was it?


So I first reimplemented the color slider, and it feels more fitting:


<img class="light" src="/blog/DevLog-2025.03.20/assets/histoire-color-slider.avif" alt="color slider" />

<img class="dark" src="/blog/DevLog-2025.03.20/assets/histoire-color-slider-dark.avif" alt="color slider" />


That indeed makes the slider more professional.


The logo and the default green can be replaced to stay consistent with the AIRI theme, which is why I designed another logo specifically for the UI page:


<img class="light" src="/blog/DevLog-2025.03.20/assets/histoire-logo.avif" alt="project airi logo for histoire" />

<img class="dark" src="/blog/DevLog-2025.03.20/assets/histoire-logo-dark.avif" alt="project airi logo for histoire" />


Oh, right, the entire UI component library has been deployed to Netlify as usual at the `/ui/` path. If you want to see what the UI elements look like, feel free to check it out:


[https://airi.moeru.ai/ui/](https://airi.moeru.ai/ui/)


There are many other features that we cannot fully cover in this DevLog:


- [x] Support all LLM providers.
- [x] Improved animations and transitions for the menu navigation UI.
- [x] Improved field spacing, new forms!
- [x] Components (almost all the to-do components on the [roadmap](https://github.com/moeru-ai/airi/issues/42))
  - [x] Form
    - [x] Radio
    - [x] Radio group
    - [x] Model catalog
    - [x] Range
    - [x] Input
    - [x] Key-value input
  - [x] Data GUI
    - [x] Range
  - [x] Menu
    - [x] Menu item
    - [x] Menu state item
  - [x] Graphics
    - [x] 3D
  - [x] Physics
    - [x] Cursor momentum
  - [x] More...


We also did some other experiments with momentum and 3D.


Take a look at this:


<img class="light" src="/blog/DevLog-2025.03.20/assets/new-ui-v4-speech.avif" alt="brand new speech design" />

<img class="dark" src="/blog/DevLog-2025.03.20/assets/new-ui-v4-speech-dark.avif" alt="brand new speech design" />


We finally support speech model configuration 🎉! (Previously only ElevenLabs could be configured.) Since the new [`v0.1.2` release](https://github.com/moeru-ai/unspeech/releases/tag/v0.1.2) of `unspeech` — another amazing project we are developing — Microsoft Speech services (i.e. Azure AI Speech, or Cognitive Speech) can be requested through [`@xsai/generate-speech`](https://xsai.js.org/docs/packages/generate/speech). This means we finally have an OpenAI API-compatible TTS service for Microsoft.


But why is supporting this so important?


Because for the first version of Neuro-sama, the text-to-speech service was powered by Microsoft, using a voice named `Ashley`, and with a `+20%` pitch you get the exact same voice as the first version of Neuro-sama. Try it yourself:


<audio controls style="width: 100%;">
  <source src="./assets/ashley-pitch-test.mp3" />
</audio>


Isn't it exactly the same? This is insane! It means we can finally get closer to what Neuro-sama can do with the new **speech** capability!


<img src="/blog/DevLog-2025.03.20/assets/steins-gate-mayori.avif" alt="character from anime Steins;Gate" />

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


With all of this, we can get this result:


<ThemedVideo controls muted autoplay src="/blog/DevLog-2025.03.20/assets/airi-demo.mp4" />


Almost exactly the same. But our story does not end here. At the moment, we have not implemented memory features or better motion control, and the transcription settings UI is still missing. We hope to finish these by the end of the month.


We plan to have


- [ ] Memory Postgres + Vector
- [ ] Embedding settings UI
- [ ] Transcription settings UI
- [ ] Memory DuckDB WASM + Vector
- [ ] Motion embedding
- [ ] Speech settings UI


That's it for today's DevLog. Thank you to everyone who joined the DevStream and stayed with us to the very end.


See you tomorrow.


> El Psy Congroo.

