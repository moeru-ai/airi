---
title: DevLog @ 2025.03.20
category: DevLog
date: 2025-03-20
---

<script setup>
import Gelbana from './assets/steins-gate-gelnana-from-elpsycongrooblog.avif'
import NewUIV3 from '../DevLog-2025.03.10/assets/new-ui-v3.avif'
import NewUIV3Dark from '../DevLog-2025.03.10/assets/new-ui-v3-dark.avif'
import HistoireColorSlider from './assets/histoire-color-slider.avif'
import HistoireColorSliderDark from './assets/histoire-color-slider-dark.avif'
import HistoireLogo from './assets/histoire-logo.avif'
import HistoireLogoDark from './assets/histoire-logo-dark.avif'
import NewUIV4Speech from './assets/new-ui-v4-speech.avif'
import NewUIV4SpeechDark from './assets/new-ui-v4-speech-dark.avif'
import SteinsGateMayori from './assets/steins-gate-mayori.avif'
</script>

Hello again! It has been 10 days since the [last post of DevLog](../references/contributing/guide/).

We made a lot of improvements to our user interface, we made it possible
to integrate more LLM providers, and speech providers, first time to post
AIRI on Discord, bilibili, and many other social media platforms.

There is so much more that we can't wait to tell you about.

## Dejavu

Let's rewind the time a little bit!

<img :src="Gelbana" alt="Gelbana" />

> Ahh, don't worry, our beloved [AIRI](https://github.com/moeru-ai/airi) will
> not turn into GEL-NANA like this. BUT, if you haven't watched the
> [_Steins;Gate_](https://myanimelist.net/anime/9253/Steins_Gate) anime series,
> try it~!

We were working on the initial settings UI design, and animation has been
improved, customizable theme coloring has been achieved for 10 days ago.
It was indeed a busy week for any of us (especially we are all part-time on
this project, haha, join us if you will. 🥺 (PLEASED FACE)).

And this was the final result we got at that time:

<img class="light" :src="NewUIV3" alt="new ui" />
<img class="dark" :src="NewUIV3Dark" alt="new ui" />

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

~~Welcome to the β sekaisen.~~

Since we have the colored card for model radio group, and navigation items,
with the customizable themes, it's obvious that we will definitely suffer
in debugging the UI components within the business workflows, clearly it
will slow us down.

This is where we made the decision to introduce the amazing tool called
[`Histoire`](https://histoire.dev), basically a
[Storybook](https://storybook.js.org/) but much more native to
[Vite](https://vitejs.dev) and [Vue.js](https://vuejs.org) combination.

Here's the first look that [@sumimakito](https://github.com/sumimakito)
recorded once done:

<video muted autoplay>
  <source src="./assets/histoire-first-look.mp4" />
</video>

The entire OKLCH color palette can spread on to the canvas all at once
for us to take as reference. But it wasn't perfect to tryout the colors
and have the same scheme of feelings of Project AIRI's theme, was it?

So I first re-implemented the color slider, which feels much more suitable:

<img class="light" :src="HistoireColorSlider" alt="color slider" />
<img class="dark" :src="HistoireColorSliderDark" alt="color slider" />

This does make the slider a bit more professional.

The logo and the default greenish color can be replaced to align the theme
of AIRI, that's why I designed another dedicated logo for the UI page:

<img class="light" :src="HistoireLogo" alt="project airi logo for histoire" />
<img class="dark" :src="HistoireLogoDark" alt="project airi logo for histoire" />

Oh, right, the entire UI component has been deployed to Netlify as usual
under the path `/ui/`, feel free to take a look at it if you ever wondered
how does the UI elements look like:
[https://airi.moeru.ai/ui/](https://airi.moeru.ai/ui/)

There are tons of other features that we cannot cover in this DevLog entirely:

- [x] Supported for all of the LLM providers.
- [x] Improved the animation and transition of menu navigation UI.
- [x] Improved the spacing of the fields, new form!
- [x] Component for (almost all the todo components on the [Roadmap](https://github.com/moeru-ai/airi/issues/42))
  - [x] Form
    - [x] Radio
    - [x] Radio Group
    - [x] Model Catalog
    - [x] Range
    - [x] Input
    - [x] Key Value Input
  - [x] Data Gui
    - [x]  Range
  - [x] Menu
    - [x] Menu Item
    - [x] Menu Status Item
  - [x] Graphics
    - [x] 3D
  - [x] Physics
    - [x] Cursor Momentum
  - [x] And more...

We did some other experiment over the momentum and 3D too.

Check this out:

<img class="light" :src="NewUIV4Speech" alt="brand new speech design" />
<img class="dark" :src="NewUIV4SpeechDark" alt="brand new speech design" />

We finally supported speech models configurations 🎉! (Previously was
only capable to configure for ElevenLabs) Since the
[new `v0.1.2` version](https://github.com/moeru-ai/unspeech/releases/tag/v0.1.2)
of another amazing project we were working on called `unspeech`, it's possible
to request the Microsoft Speech service (a.k.a. Azure AI Speech service, or
Cognitive Speech service) through
[`@xsai/generate-speech`](https://xsai.js.org/docs/packages/generate/speech), which
means we finally got a OpenAI API compatible TTS for Microsoft.

But why was this so important to support?

It's because that for the very first version of Neuro-sama, the text-to-speech
service was powered by Microsoft, with the voice named `Ashley`, along with a
`+20%` of pitch, you can get the same voice as Neuro-sama's first version, try it
yourself:

<audio controls style="width: 100%;">
  <source src="./assets/ashley-pitch-test.mp3" />
</audio>

Isn't it the same, this is insane! That's means, we can finally approach to
what Neuro-sama can do with the new **Speech** ability!

<img :src="SteinsGateMayori" alt="character from anime Steins;Gate" />

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

With all of those, we can get this result:

<video control muted autoplay>
  <source src="./assets/airi-demo.mp4" />
</video>

Nearly the same. But our story doesn't end here, currently, we haven't
achieved memory, and better motion control, and the transcription settings
UI was missing too. Hopefully we can get this done before the end of the
month.

We are planning to have

- [ ] Memory Postgres + Vector
- [ ] Embedding settings UI
- [ ] Transcription settings UI
- [ ] Memory DuckDB WASM + Vector
- [ ] Motion embedding
- [ ] Speaches settings UI

That's all for today's DevLog, thank you to everyone that read the DevLog
all the way down here.

I'll see you all tomorrow.

> El Psy Congroo.
