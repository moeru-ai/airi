---
title: DevLog @ 2025.08.05
description: |
  v0.7 release. Windows is now fully supported, with many more features.
date: 2025-08-04
excerpt: Sorry to keep everyone waiting!<br/> v0.7 was originally planned for early July, but it was delayed until now because we found several critical bugs on Windows and needed more adaptation work.
preview-cover:
  light: "/blog/DevLog-2025.08.05/assets/cover-light.avif"
  dark: "/blog/DevLog-2025.08.05/assets/cover-dark.avif"
---


<script setup lang="ts">
import Button from '../../../../.vitepress/components/Button.vue'
function handleOpenLatest() {
  window.open('https://github.com/moeru-ai/airi/releases/latest', '_blank')
}
</script>


Hello everyone! This is [Neko](https://github.com/nekomeowww).


Sorry to keep everyone waiting! v0.7 was originally planned for early July,


but it was delayed until now because of several Windows compatibility issues that kept us up at night,


and the huge scope of changes we decided to tackle.


<Button @click="handleOpenLatest">
  Download
</Button>


Still, I am excited to finally share with you what we have been preparing over the past two months.


Please check out the blog and DevLog articles I wrote earlier that you might be interested in:


- [DreamLog 0x1](../DreamLog-0x1/)
- [DevLog @ 2025.05.16](../DevLog-2025.05.16/)


Let me be honest with you about the past three months:


- [**391 commits**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**1017 files changed**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**74,548 lines added**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**13,930 lines deleted**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)


> But for those of you working in the software industry, these numbers mean nothing;
> they are just a reflection of the significant impact we made in this release.
>
> Don't worry, I will walk you through the highlights in this DevLog.


## Milestones


With the release of v0.7 and this DevLog,


I would like to mention some milestones we have reached so far:


- We have 1850+ stars on GitHub! 🎉
- We have 40+ contributors! 🫂
- We have 300+ Discord members! 👾
- We introduced ourselves on [Hacker News](https://news.ycombinator.com/item?id=44573640)
- We introduced ourselves on [Product Hunt](https://www.producthunt.com/products/airi)
- We ranked `#1` on the GitHub trending list on July 17, 2025 🏆


## Features


### Desktop Version


Tamagotchi is the name of the AIRI desktop version. You can let it run as a standalone,


always-on companion on your desktop, working alongside other applications without interfering with your work.


Previously, the desktop version was more experimental, with a UI/UX that was not refined or complete enough,


and modules like local ASR/STT (speech-to-text) were not yet available.


The settings for using audio input devices were also a missing part.


But now it has been massively improved.


#### Hide on Hover™


In the previous version v0.6, we introduced the **Hide on Hover™** feature:


> Just kidding, we open-source this project under the MIT license,
> and this feature has no registered trademark.


::: tip


To turn off the **Hide on Hover** feature, the default shortcut is <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="I" inline-block>I</kbd>


:::


<br />

<ThemedVideo autoplay src="/blog/DevLog-2025.08.05/assets/airi-demo-fade-on-hover.mp4" />


Many users found it confusing that the whole window fades out every time the cursor hovers over the character.


We apologize for the lack of documentation explaining this feature and why we think it is important for an AI companion.


For any VTuber application, VTuber Studio and Warudo — the two most popular applications —


support Live2D and VRM 3D models. Since they are designed for VTuber streaming purposes,


when streaming with OBS (Open Broadcaster Software),


users do not need to worry about window order, thanks to the ability to orchestrate scene elements in different layers:


the model window will always be a minimized window with a transparent background,


for OBS or other streaming capture drivers to capture **in the background**.


If you intend to use AIRI for VTuber streaming, it is fine not to use Hide on Hover.


But once you want it to live on your desktop as a virtual companion, you will start to notice:


- If we design the model window to always stay on top, it will block mouse events for the applications below it,


  which is not what we want.


- If you have to manually toggle the visibility of the model window, it brings a lot of inconvenience,


  especially when you are focused on what you are working on.


That is why we came up with this idea: create a feature that allows any character in AIRI


to fade out when the mouse hovers over the window, and pass mouse click events to the applications below.


I personally really love this feature, because now I can let the character in AIRI


use any application with me without worrying about disabling or organizing window order.


Every day when I develop AIRI, whether the web version or the desktop version,


I always keep her open on my desktop, accompanying me alongside the terminal and VSCode/Cursor.


**Hide on Hover™** is not the only feature we updated in the desktop version.


We also made many UI/UX improvements and added more features to make it more usable.


#### Move


Since the **Hide on Hover™** window allows mouse events to pass through,


sometimes you may want to move or adjust the model window's position to a better place —


maybe the bottom right corner, or the bottom center...


The look of the draggable area has been improved, with rounded corners to match our theme.


::: tip


The default shortcut for move mode is <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="N" inline-block>N</kbd>


:::


<br />

<ThemedVideo autoplay src="/blog/DevLog-2025.08.05/assets/airi-demo-move.mp4" />


Entering move mode shows a draggable area. Besides moving the position with the mouse,


using the tray menu's Position > Center / Bottom Left / Bottom Right is another option.


#### Resize


Not everyone's model is the same size, so the ability to resize the model window is also critical.


Same as move mode, the resize border indicator uses rounded corners,


and the avatar's edges are also trimmed with rounded corners.


::: tip


The default shortcut for move mode is <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="R" inline-block>R</kbd>


:::


<br />

<video autoplay controls muted loop playsinline>
  <source src="/blog/DevLog-2025.08.05/assets/airi-demo-resize.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>


#### Resource Island


Waiting for the models for ASR/STT (speech-to-text) and VAD (voice activity detection) to load is painful.


We had to find a way to visualize the download progress of different modules and required files,


just like Steam and Battle.net do.


We designed a new component called the **Resource Island** (inspired by iOS's Dynamic Island),


a floating, hoverable widget that shows the progress of downloading and installing modules,


and disappears once the download is complete.


Watch it in action:


<ThemedVideo autoplay src="/blog/DevLog-2025.08.05/assets/airi-demo-resource-island.mp4" />


It does include a link to the module being prepared, so you can click the module link


to open the target module's settings page and understand why this model or file is needed.


#### Local ASR/STT


Thanks to [@luoling8192 (Luoling)](https://github.com/luoling8192), and the experiments we did in the repository


[candle-examples](https://github.com/proj-airi/candle-examples),


we now have a local ASR/STT engine that works on Windows, macOS, and Linux.


<video autoplay controls muted loop playsinline>
  <source src="/blog/DevLog-2025.08.05/assets/airi-demo-settings-hearing.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

<br />


::: info


This demo uses OpenAI's speech service, but it can be switched to a local provider's ASR/STT.


:::


Initially we tried to use candle directly, but I could not find a good way to


build and embed the candle runtime for Windows and Linux (with and without CUDA).


We decided to switch to ort (the ONNX runtime for Rust), which gives us


similar performance and accuracy, but with better compatibility and easier use.


### Web


#### Onboarding


We know that configuring AIRI is quite complex right now (though it is still easier compared to many other pure-Python-based ones,


which require you to understand the code structure to configure).


Thanks to the contribution of [Me1td0wn76 (melty kiss)](https://github.com/Me1td0wn76),


onboarding support was added to the Web version, so now you can get a better experience


when using AIRI for the first time.


After the Pull Request was merged, they wrote a blog post to share


their experience contributing to Project AIRI: [AIRIプロジェクトに参加した話 - YAMA-blog](https://yama-pro.blog/posts/airi/)


<img class="light" src="/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-light.avif" alt="Onboarding in light mode" />

<img class="dark" src="/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-dark.avif" alt="Onboarding in dark mode" />


Watch it in action:


<ThemedVideo
  autoplay
  light="/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-light.mp4"
  dark="/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-dark.mp4"
/>


#### VRM


Thanks to the hard work of [Lilia-Chen (Lilia_Chen)](https://github.com/Lilia-Chen),


VRM models are now displayed better with a precise camera implementation and rendering mechanism.


<img class="light" src="/blog/DevLog-2025.08.05/assets/airi-demo-vrm-light.avif" alt="VRM in light mode" />

<img class="dark" src="/blog/DevLog-2025.08.05/assets/airi-demo-vrm-dark.avif" alt="VRM in dark mode" />


### Mobile Web


#### Onboarding


The onboarding is also available for the mobile web version:


<ThemedVideo
  autoplay
  light="/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-mobile-light.mp4"
  dark="/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-mobile-dark.mp4"
/>


#### Scene


The main scene on mobile has been completely redesigned and rewritten.


Thanks to [LemonNekoGH (LemonNeko)](https://github.com/LemonNekoGH), we now have


a better way to adjust the offset of the Live2D model in the scene.


We drew this design inspiration from the volume control on the iOS side,


and we hope you find it more intuitive and easier to get started with.


::: tip


Want to reset to default? Double-click the X, Y, or Scale buttons to reset the values to their defaults.


:::


<br />

<video class="light" autoplay controls muted loop playsinline>
  <source src="/blog/DevLog-2025.08.05/assets/airi-demo-quick-editor-mobile-light.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

<video class="dark" autoplay controls muted loop playsinline>
  <source src="/blog/DevLog-2025.08.05/assets/airi-demo-quick-editor-mobile-dark.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>


### Both Versions


We made many more interesting new components for these features.


#### Better Text Animations


We improved the text animations of the chat bubbles. [sumimakito (Makito)](https://github.com/sumimakito/)


wrote an entire detailed DevLog a few days ago explaining why we implemented it specifically


and how we considered its i18n compatibility. Be sure to check it out: [DevLog 2025.08.01](../DevLog-2025.08.01/).


Watch it in action:


<video class="light" autoplay controls muted loop playsinline>
  <source src="/blog/DevLog-2025.08.05/assets/airi-demo-clustr-light.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

<video class="dark" autoplay controls muted loop playsinline>
  <source src="/blog/DevLog-2025.08.05/assets/airi-demo-clustr-dark.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>


#### Level Meter


> UI component: https://airi.moeru.ai/ui/#/story/src-components-gadgets-levelmeter-story-vue


Useful when you want to show the detected audio input level or real-time system load:


<img class="light" src="/blog/DevLog-2025.08.05/assets/airi-ui-level-meter-light.avif" alt="Level meter in light mode" />

<img class="dark" src="/blog/DevLog-2025.08.05/assets/airi-ui-level-meter-dark.avif" alt="Level meter in dark mode" />


#### Time Series Chart


> UI component: https://airi.moeru.ai/ui/#/story/src-components-gadgets-timeserieschart-story-vue


Similar to the level meter for changing values, but especially useful for historical data.


<img class="light" src="/blog/DevLog-2025.08.05/assets/airi-ui-time-series-chart-light.avif" alt="Time series chart in light mode" />

<img class="dark" src="/blog/DevLog-2025.08.05/assets/airi-ui-time-series-chart-dark.avif" alt="Time series chart in dark mode" />


We also added many more components...


- [x] `<Progress />` (thanks to @Menci [2cb602aa](https://github.com/moeru-ai/airi/commit/2cb602aa3eac456a479b622a5ecf043831597ffe))
- [x] `<FieldSelect />` ([d0d782ff](https://github.com/moeru-ai/airi/commit/d0d782ff94a5a0a12819725303f687bd1a47e87c))
- [x] `<Alert />` (thanks to [@typed-sigterm](https://github.com/typed-sigterm), [#295](https://github.com/moeru-ai/airi/pull/295))
- [x] `<ErrorContainer />` (thanks to [@typed-sigterm](https://github.com/typed-sigterm), [#295](https://github.com/moeru-ai/airi/pull/295))
- [x] New sidebar navigation design
- [x] Message notifier
- [x] Notify users to update when a new version is available


## Community


### New Documentation Site


We now have a brand new documentation site:


<video class="light" autoplay controls muted loop playsinline>
  <source src="/blog/DevLog-2025.08.05/assets/airi-docs-light.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

<video class="dark" autoplay controls muted loop playsinline>
  <source src="/blog/DevLog-2025.08.05/assets/airi-docs-dark.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>


It looks great — we completely rewrote it, based on the work of [Reka UI](https://reka-ui.com),


but added a lot of features, including a blog post list, language switching, and adapted many styles to VitePress.


As always, thanks for their beautiful design — we used many of their components to build our own.


Be sure to check them out!


The blog page also looks great, and even better, there are new covers designed by [@lynzrand (Rynco Maekawa)](https://github.com/lynzrand)


<img class="light" src="/blog/DevLog-2025.08.05/assets/airi-docs-blogs-light.avif" alt="Blog page in light mode" />

<img class="dark" src="/blog/DevLog-2025.08.05/assets/airi-docs-blogs-dark.avif" alt="Blog page in dark mode" />


### Translation Workflow Changes


We split the so-called `i18n` or localization files into a dedicated package in our huge monorepo.


When contributing new localizations, adding new translations, or fixing existing translations,


please first navigate to https://github.com/moeru-ai/airi/tree/main/packages/i18n/src/locales.


<img class="light" src="/blog/DevLog-2025.08.05/assets/airi-packages-i18n-light.avif" alt="i18n package structure in light mode" />

<img class="dark" src="/blog/DevLog-2025.08.05/assets/airi-packages-i18n-dark.avif" alt="i18n package structure in dark mode" />


You will find different directories for different languages here. Select the language you want and continue.


Taking English as an example, the directory structure looks like this:

```bash

└── en

  ├── docs

  ├── tamagotchi

  #

  ├── base.yaml

  ├── settings.yaml

  ├── stage.yaml

  └── index.ts

```


`docs` and `tamagotchi` are two directories dedicated to different modules:


- The documentation site
- The desktop version (Tamagotchi)


If you want to help translate the documentation site (the UI, not articles or actual documentation),


you can navigate to the `docs` directory and edit the `theme.yaml` file,


which contains the UI strings of the documentation site.


The `tamagotchi` directory is a bit special — you may not be able to find all translation strings there.


It is meant to contain a few special translations used only in the desktop version,


while everything else is in the root directory.


For everything outside `docs` and `tamagotchi`:


- `base.yaml` contains the basic strings of the language, the basic states of buttons
- `settings.yaml` contains the strings of the settings pages
- `stage.yaml` contains the strings of the stage (the UI displaying the model)


If you want to add more languages, copy and paste an existing language localization directory


and rename it to the new language code. For example, if you want to add French,


copy the `en` directory to `fr`, and start editing the `base.yaml`, `settings.yaml`,


`stage.yaml`, and `index.ts` files to add translations.


Partial translation files are fine during the Pull Request review process.


::: info We Need Help!


This sounds a bit absurd, but we would like some experienced people to


help us integrate our i18n package with translation automation tools,


such as [Crowdin](https://crowdin.com) or [Weblate](https://weblate.org/en/).


We are not experts in this field; feel free to open a Pull Request to help us


or open an issue to discuss it.


:::


For language codes, use either of the following tools to find the code for the language you are using:


- [Language subtag lookup app](https://r12a.github.io/app-subtags/)
- [iana.org/assignments/language-subtag-registry/language-subtag-registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry)

```bash

.

├── packages

    ├── i18n

    ├── package.json

    └── src

         ├── index.ts

         └── locales

             ├── en

             │   ├── base.yaml

             │   ├── docs

             │   │   ├── index.ts

             │   │   └── theme.yaml

             │   ├── index.ts

             │   ├── settings.yaml

             │   ├── stage.yaml

             │   └── tamagotchi

             │       ├── index.ts

             │       ├── settings.yaml

             │       └── stage.yaml

             ├── index.ts

             └── zh-Hans

                 ├── base.yaml

                 ├── docs

                 │   ├── index.ts

                 │   └── theme.yaml

                 ├── index.ts

                 ├── settings.yaml

                 ├── stage.yaml

                 └── tamagotchi

                     ├── index.ts

                     ├── settings.yaml

                     └── stage.yaml

```


You can read more related resources here:


- https://developer.mozilla.org/en-US/docs/Glossary/BCP_47_language_tag
- https://en.wikipedia.org/wiki/IETF_language_tag
- https://en.wikipedia.org/wiki/ISO_15924


## Engineering


### Toolchain Made Our Workflow Many Times Faster


TL;DR:


- We converted many packages to a **buildless** setup
- We removed the `stub` from `unbuild`
- We switched to `rolldown-vite`
- We replaced `unbuild` with `tsdown`
- We integrated `turborepo` for faster and cached builds


In more detail:


Previously, to achieve a seamless development experience, when we chose to use a Monorepo architecture,


we had to rely on `postinstall` scripts to bootstrap stub packages with their own `jiti` exports and `.d.ts` modules,


every time a contributor installed dependencies after cloning our project.


This ensured contributors did not need to learn how the monorepo works to contribute.


However, it was obviously not a smart strategy to rebuild and re-stub every time `pnpm install` was triggered.


With the changes introduced by [@kwaa](https://github.com/kwaa) for the buildless architecture,


the biggest package `stage-ui`, which used to take the most time, can now be skipped without any type-check or dependency resolution issues.


Later, [@kwaa](https://github.com/kwaa) helped remove the sometimes problematic, redundant `stub` script brought by `unbuild`,


which gave us a cleaner workflow without having to fight the annoying


`The requested module './dist/index.mjs' does not provide an export named 'foo'` errors anymore.


The biggest change came two months ago, when [@kwaa](https://github.com/kwaa) chose to switch to `rolldown-vite` to replace `vite`


to **achieve a faster workflow: 2x faster**.


But that was not the end. We replaced `unbuild` with `tsdown`, which **introduced another 4.2x speedup**,


and each sub-package now builds in under 250 milliseconds.


> There are more benefits to migrating to `tsdown`...
>
> - Performs unused dependency checks
> - Bundles CSS
> - Bundles Vue SFC components


Now, the `postinstall` script is still required, but if we can find a way


to cache build results with dependency awareness, many redundant builds can be avoided.


This is where `turborepo` helps us achieve faster builds.


With `turborepo`, the time to build AIRI **went from an average of 4 minutes down to 25 seconds**.


### Nix Is Now Supported


Thanks to [@Weathercold (Weathercold)](https://github.com/Weathercold), we now


have a Nix flake to build AIRI, which is a great addition to cross-platform compatibility.


It even works on macOS.


We are waiting for the final Pull Request to be merged into nix-pkgs,


but you can try it with the following command:

```bash

nix run --extra-experimental-features 'nix-command flakes' github:moeru-ai/airi

```


### Unified Build Pipeline


Previously, the test, staging, and release build pipelines were all different,


which was a nightmare for me when deciding to release a new version,


because we were not sure whether the pipeline would succeed.


Although Tauri brought us many cross-platform compatibility benefits,


along with the powerful ability to use Rust for system calls and integration into native OS features...


Initially, in the early stages of v0.7 development, I introduced


[huggingface/candle](https://github.com/huggingface/candle) as the inference engine implementation for the ASR/STT pipeline,


but it depended on NVIDIA CUDA, so the build was really messy, with incompatibilities everywhere.


But now it is much better — we have a scheduled build pipeline that runs the same scripts and workflow steps as the release, every day.


(You may have heard of it as `canary` or `nightly` builds.)


So technically, if you run into any issues with the latest version,


you can always try the latest build of the `main` branch to see if we have fixed it.


Nightly builds can be found at https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml


## Before We End...


New packages born between these versions:


> Shout out to [@sumimakito](https://github.com/sumimakito), who did so many amazing things... I cannot even count them...


- [`@proj-airi/chromatic`](https://github.com/proj-airi/chromatic) (by [@sumimakito](https://github.com/sumimakito))
- [`@proj-airi/unocss-preset-chromatic`](https://github.com/proj-airi/chromatic) (by [@sumimakito](https://github.com/sumimakito))
- [`@moeru-ai/jem`](https://github.com/moeru-ai/inventory/tree/main/packages/jem-validator) (by [@LemonNekoGH](https://github.com/LemonNekoGH)), unified model catalog
- [`clustr`](https://github.com/sumimakito/clustr) (by [@sumimakito](https://github.com/sumimakito))
- [`@proj-airi/drizzle-orm-browser`](https://github.com/proj-airi/drizzle-orm-browser) (by me)


Side projects born between these versions:


- [HuggingFace Inspector](https://hf-inspector.moeru.ai/) (https://github.com/moeru-ai/hf-inspector)
- [More candle examples on whisper & VAD, candle, burn, and ort](https://github.com/proj-airi/candle-examples)
- [(Model catalog) Inventory commit!](https://github.com/moeru-ai/inventory/pull/1) (by [@LemonNekoGH](https://github.com/LemonNekoGH))


We cannot cover everything in this DevLog. For details, you can always track and review


[Roadmap v0.7](https://github.com/moeru-ai/airi/issues/200) on our roadmap.

<div class="w-full flex flex-col items-center justify-center gap-3 py-3">
  <img src="/blog/DevLog-2025.08.05/assets/relu-sticker-thinks.avif" alt="ReLU sticker thinking" class="w-30!" />
  <div class="text-center">
    <span class="block font-bold">Thank you for reading this far!</span>
  </div>
</div>

