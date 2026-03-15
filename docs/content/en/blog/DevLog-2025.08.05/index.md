---
title: DevLog @ 2025.08.05
description: |
  v0.7 rolled out. Windows now fully supported, many more features included.
date: 2025-08-04
excerpt: Sorry for the long wait!<br/> v0.7 was supposed to be released in early July, due to several critical bugs we found on Windows, and many more adaptations we had to do, it was delayed until now.
preview-cover:
  light: "@assets('./assets/cover-light.avif')"
  dark: "@assets('./assets/cover-dark.avif')"
---

<script setup lang="ts">
import Button from '../../../../.vitepress/components/Button.vue'

function handleOpenLatest() {
  window.open('https://github.com/moeru-ai/airi/releases/latest', '_blank')
}
</script>

Hello again! Here's [Neko](https://github.com/nekomeowww).

Sorry for the long wait! v0.7 was supposed to be released in early July,
but due to several critical Windows compatibility issues that kept us
up at night, and the sheer scope of changes we decided to tackle, it
got delayed until now.

<Button @click="handleOpenLatest">
  Download
</Button>

Still, I'm excited to finally share what we've been cooking for the
past two months.

Do check the past Blog & DevLog posts I wrote that are interesting to you:

- [DreamLog 0x1](../DreamLog-0x1/)
- [DevLog @ 2025.05.16](../DevLog-2025.05.16/)

Let me be brutally honest about what the past three months looked like:

- [**391 commits**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**1017 files changed**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**74,548 lines added**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**13,930 lines removed**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)

> But for those of you who worked for software industries, these numbers mean,
> nothing, it's just a reflection of the big impact we made in this release.
>
> No worries, I will walk you through the highlights in this DevLog.

## Milestones

With the release of v0.7 and this DevLog posted,
I would love to mention some of the milestones we achieved so far:

- We reached 1850+ stars on GitHub! 🎉
- We have over 40+ contributors! 🫂
- We got over 300+ Discord members! 👾
- We announced ourselves on [Hacker News](https://news.ycombinator.com/item?id=44573640)
- We announced ourselves on [Product Hunt](https://www.producthunt.com/products/airi)
- We were trending on GitHub `#1` 🏆 on July 17, 2025

## Features

### Desktop version

Tamagotchi is the name of the Desktop version of AIRI, where you can have it
running as a separated, and always-running companion on Desktop with other
applications without interfering your work.

Previously, the Desktop version was more in a experiment stage where the UI/UX
wasn't polished and refined enough, modules like local ASR/STT (speech-to-text) wasn't
usable. Settings of using audio input devices were also the missing pieces.

But now it's drastically improved.

#### Fade on hover™

In the last release, v0.6, we introduced the **Fade on hover™** feature:

> Just kidding, we are open sourcing this project under MIT license,
> there is no any trademark registered for this feature.

::: tip
To toggle off the **Fade on hover** feature, default shortcut is <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="I" inline-block>I</kbd>
:::

<br />

<ThemedVideo autoplay src="./assets/airi-demo-fade-on-hover.mp4" />

Many users found it quite confusing why every time cursor hovers over the
characters, entire window fades out. Apologies for the lack of documentation
explaining this feature and why we think it's important for AI companions.

For any VTuber applications, VTuber Studio, Warudo the most two popular ones
supports for Live2D and VRM 3D models, since they are designed for VTuber
streaming purpose, when using OBS (Open Broadcaster Software) to stream,
because of the capabilities of orchestrating the scenes with elements in
different layers, users wouldn't need to worry about the window order:
the model window will always be a minimized window with transparent
background for OBS or other streaming capturing drivers to capture
**in the background**.

If you are going to use AIRI for VTuber streaming, it's fine to not having
the Fade on hover feature, but once you wish to have it living as a
virtual companion on your Desktop, you will start to notice that:

- If we design to have the model window always on top, it will block
  the mouse events to the applications underneath it, which is not what we
  want.
- If you have to manually toggle the visibility of the model window, it causes
  a lot of inconvenience, especially focusing on something you are working
  on.

That's why we came up with the idea: make a feature to allow any characters
inside AIRI to fade out when the mouse is hovering over the window, and
passthrough the mouse clicking events to the applications underneath it.

I personally love this feature a lot since I can now have the characters inside
AIRI to stay with me with any applications I use now without worrying about
to disable or organize the order of the windows. Everyday when I developing
AIRI, no matter it's Web version or Desktop version, I will always open her
on my Desktop, along with Terminal, VSCode/Cursor, with me.

**Fade on hover™** wasn't the only feature we updated in Desktop version,
we also made many improvements to the UI/UX, and added more features to
make it more usable.

#### Move

Since **Fade on hover™** window allows mouse events to pass through,
sometimes you may want to move or adjust the position of the model window
to a better place, perhaps, bottom right, or bottom center...

The looking of the draggable area has been improved with rounded
corners to match our theme.

::: tip
The default shortcut of Move mode is <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="N" inline-block>N</kbd>
:::

<br />

<ThemedVideo autoplay src="./assets/airi-demo-move.mp4" />

A draggable area will appear when entering Move mode, besides moving position
with mouse, using the Position > Center / Bottom Left / Bottom Right in Tray
menu would be another option though.

#### Resize

Not everyone's model sizes the same, abilities to resize the model window
is crucial too.

Same as Move mode, rounded corners are applied to the resize border indicator,
the edge of the avatar got a trimmed rounded edge too.

::: tip
The default shortcut of Move mode is <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="R" inline-block>R</kbd>
:::

<br />

<ThemedVideo autoplay src="./assets/airi-demo-resize.mp4" />

#### Resource Island

Loading models for ASR/STT (speech-to-text) and VAD (voice activity detection)
is painful to wait, we must find a way to visualize the progress of downloading
for different modules and required files, just like how Steam and Battle.net
does.

We designed a new set of component called **Resource Island** (inspired from
Dynamic Island from iOS), which is a floating, hover-able widget displays
the progress of downloading and installing the modules, and it will
disappear when the download is finished.

See it in action:

<video autoplay controls muted loop>
  <source src="./assets/airi-demo-resource-island.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

It does contain a link to the preparing module, so you may click on the module
link to open the target module setting page to understand why this model or
file is required.

#### Local ASR/STT

Thanks to [@luoling8192 (Luoling)](https://github.com/luoling8192), and the experiments
we have done in the repository [candle-examples](https://github.com/proj-airi/candle-examples),
we now have a local ASR/STT engine that works on Windows, macOS and Linux.

<video autoplay controls muted loop>
  <source src="./assets/airi-demo-settings-hearing.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

<br />

::: info
This demo uses OpenAI's speech service, but it's possible to switch to local provider
for ASR/STT.
:::

Initially we tried to use candle directly but I couldn't find a good way to
use and embed the candle runtime (with and without CUDA) for Windows and Linux
builds, we decided to switch to ort (ONNX Runtime for Rust), which provides
us similar performance and accuracy, but with much better compatibility
and easier to use.

### Web

#### Onboarding

We know that configuring AIRI is quite complex now (but still easy if comparing
to many other pure Python based ones where you have to understand the code structure
to configure it).

Thanks to [Me1td0wn76 (melty kiss)](https://github.com/Me1td0wn76)'s contribution
adding support of adding onboarding screen for Web version, now you can
have a much better experience when you first time using AIRI.

They wrote a blog after the Pull Request being merged to share the
experience contributing Project AIRI: [AIRIプロジェクトに参加した話 - YAMA-blog](https://yama-pro.blog/posts/airi/)

<img class="light" src="./assets/airi-demo-onboarding-light.avif" alt="Onboarding light mode" />
<img class="dark" src="./assets/airi-demo-onboarding-dark.avif" alt="Onboarding dark mode" />

See it in action:

<ThemedVideo
  autoplay
  light="./assets/airi-demo-onboarding-light.mp4"
  dark="./assets/airi-demo-onboarding-dark.mp4"
/>

#### VRM

Thanks to the hard work done by [Lilia-Chen (Lilia_Chen)](https://github.com/Lilia-Chen),
VRM models are now displayed better with precise camera implementation and rendering
mechanism.

<img class="light" src="./assets/airi-demo-vrm-light.avif" alt="Time series chart light mode" />
<img class="dark" src="./assets/airi-demo-vrm-dark.avif" alt="Time series chart dark mode" />

### Mobile Web

#### Onboarding

Onboarding is also available for Mobile Web version:

<ThemedVideo
  autoplay
  light="./assets/airi-demo-onboarding-mobile-light.mp4"
  dark="./assets/airi-demo-onboarding-mobile-dark.mp4"
/>

#### Scene

The primary scene on mobile has been redesigned and rewritten completely.

Thanks to [LemonNekoGH (LemonNeko)](https://github.com/LemonNekoGH), we now have a
better way to adjust the offset of the Live2D model in the scene.

We drawn this design idea from iOS's volume control on side, we hope you may find
more intuitive and straightforward to get on hands on it.

::: tip
Want to reset to default value? Double tap the X, Y, or Scale button to reset the
value to default.
:::

<br />

<video class="light" autoplay controls muted loop>
  <source src="./assets/airi-demo-quick-editor-mobile-light.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

<video class="dark" autoplay controls muted loop>
  <source src="./assets/airi-demo-quick-editor-mobile-dark.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

### Both version

We made many more new interesting components for the features.

#### Better text animation

We improved the text animation of the chat bubbles, [sumimakito (Makito)](https://github.com/sumimakito/)
wrote a entire decent DevLog about it and posted just a few days ago explaining
it in detail why we implemented it special and how we consider the i18n compatibility
around it, definitely check it out: [DevLog 2025.08.01](../DevLog-2025.08.01/).

See it in action:

<video class="light" autoplay controls muted loop>
  <source src="./assets/airi-demo-clustr-light.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

<video class="dark" autoplay controls muted loop>
  <source src="./assets/airi-demo-clustr-dark.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

#### Level meter

> UI Component: https://airi.moeru.ai/ui/#/story/src-components-gadgets-levelmeter-story-vue

Useful when wishing to display the detected meter of the audio input, or
the realtime system load:

<img class="light" src="./assets/airi-ui-level-meter-light.avif" alt="Level meter light mode" />
<img class="dark" src="./assets/airi-ui-level-meter-dark.avif" alt="Level meter dark mode" />

#### Time series chart

> UI Component: https://airi.moeru.ai/ui/#/story/src-components-gadgets-timeserieschart-story-vue

Similar to the Level meter for changing values, but especially useful for
historical data.

<img class="light" src="./assets/airi-ui-time-series-chart-light.avif" alt="Time series chart light mode" />
<img class="dark" src="./assets/airi-ui-time-series-chart-dark.avif" alt="Time series chart dark mode" />

There are many more components we added...

- [x] `<Progress />` (thanks to @Menci [2cb602aa](https://github.com/moeru-ai/airi/commit/2cb602aa3eac456a479b622a5ecf043831597ffe))
- [x] `<FieldSelect />` ([d0d782ff](https://github.com/moeru-ai/airi/commit/d0d782ff94a5a0a12819725303f687bd1a47e87c))
- [x] `<Alert />` (thanks [@typed-sigterm](https://github.com/typed-sigterm), [#295](https://github.com/moeru-ai/airi/pull/295))
- [x] `<ErrorContainer />`  (thanks [@typed-sigterm](https://github.com/typed-sigterm), [#295](https://github.com/moeru-ai/airi/pull/295))
- [x] New sidebar nav design
- [x] Toaster
- [x] Prompt to update for user when new version is available

## Community

### New documentation site

We got a brand new documentation site right now:

<ThemedVideo
  autoplay
  light="./assets/airi-docs-light.mp4"
  dark="./assets/airi-docs-dark.mp4"
/>

It looks stunning good, we completely rewrite it based on the work
done by [Reka UI](https://reka-ui.com) but added loads of features,
including Blog Post list, language switch, and adapted many styles to VitePress.

And as always, thanks to their beautiful design, we are using many
of their components to build our own, do check them out!

The blogs page looks good and better too, with new cover designed by
[@lynzrand (Rynco Maekawa)](https://github.com/lynzrand)

<img class="light" src="./assets/airi-docs-blogs-light.avif" alt="Time series chart light mode" />
<img class="dark" src="./assets/airi-docs-blogs-dark.avif" alt="Time series chart dark mode" />

### Translation workflow changes

We split the so called `i18n` or locales files out to dedicated package lives
inside our own huge monorepo.

When contributing with new locales, adding new translations,
or fixing existing ones, please navigate to https://github.com/moeru-ai/airi/tree/main/packages/i18n/src/locales
first.

<img class="light" src="./assets/airi-packages-i18n-light.avif" alt="Time series chart light mode" />
<img class="dark" src="./assets/airi-packages-i18n-dark.avif" alt="Time series chart dark mode" />

You will find different directories for different languages here. Pick
the desired one and continue.

Let's take English as an example, the directory structure looks like this:

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

`docs` and `tamagotchi` are the two directories for specifically two distinguished modules:

- Documentation site
- Desktop version (Tamagotchi)

If you would love to help to translate the documentation site (UI, not the posts or actual documents),
you can navigate to `docs` directory, and edit the `theme.yaml` file, which
contains the UI strings for the documentation site.

`tamagotchi` directory is a bit special where you may not be able to find all the translation
strings for everything, it meant to contain several special translations used only in
desktop version, while everything else are in the root directory.

For everything else other than `docs` and `tamagotchi`:

- `base.yaml` contains the essential strings for languages, basic states of buttons
- `settings.yaml` contains the strings for settings page
- `stage.yaml` contains the strings for stage (the UI where model displays)

If you attend to add more languages, copy and paste one of the existing language
locale directory and rename it to the new language code, for example,
if you want to add French, copy `en` directory to `fr`, and start editing
the `base.yaml`, `settings.yaml`, `stage.yaml` and `index.ts` files
to add the translations. It's ok to partially translate the files,
during Pull Request review process.

::: info Help wanted!
This sounds a bit ridiculous, we would love to have some experienced people
to help us to integrate our i18n package with translation automation
tools like [Crowdin](https://crowdin.com) or [Weblate](https://weblate.org/en/).

We are not expert in this field, feel free to open Pull Request to
help us or open an issue to discuss about it.
:::

For language code, please use either of the following tool to find the language code you
are working on:

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

You can read more resources about this here:

- https://developer.mozilla.org/en-US/docs/Glossary/BCP_47_language_tag
- https://en.wikipedia.org/wiki/IETF_language_tag
- https://en.wikipedia.org/wiki/ISO_15924

## Engineering

### Toolchains boosted our workflow many times faster

TL;DR:

- We transformed many packages to **buildless** setup
- We dropped `stub` from `unbuild`
- We switched to `rolldown-vite`
- We replaced `unbuild` with `tsdown`
- We integrated `turborepo` for even faster and cached builds

In much more detail:

Previously, in order to achieve seamless development experience, when we
chose to use Monorepo architecture, we had to rely on `postinstall` scripts
to bootstrap with stubbed packages with their own `jiti` exports and `.d.ts`
modules every time contributors installs the dependencies after cloning our
project.

This ensures that it wasn't necessary for contributors to learn how
monorepo works to contribute. However, it's obvious that re-build and re-stub
every time `pnpm install` triggers wasn't a clever strategy here.

With the changes introduced by [@kwaa](https://github.com/kwaa) for buildless
architecture, the previous biggest package `stage-ui` who spends the most time can
be skipped without running into any type check or dependency resolution issues.

Later on, [@kwaa](https://github.com/kwaa) helped to remove the sometimes
problematic, redundant `stub` scripts brought by `unbuild` too, this gave us‰˜
a much cleaner workflow without need to fight against the annoying
`The requested module './dist/index.mjs' does not provide an export named 'foo'`
error anymore.

The biggest changes come from two months ago, [@kwaa](https://github.com/kwaa)
chose to switch to `rolldown-vite` to replace `vite` to **achieve even faster
workflow: 2x faster**.

But this wasn't the stop, we replaced `unbuild` with `tsdown`, this
**introduced another 4.2x speedup**, each sub-package now takes less than
250ms to build.

> There are more benefit for migrating to `tsdown` though...
>
> - perform unused dependencies check
> - bundling CSS
> - bundling Vue SFC components

Now, the `postinstall` script is still required, if we could find a way to
cache the build results with dependency awareness, many redundant builds
can be avoided. This is where `turborepo` helps us even faster builds.
With `turborepo`, the time it requires to build AIRI **reduced from 4 minutes
to 25 seconds in average**.

### Now Nix is supported

Thanks to [@Weathercold (Weathercold)](https://github.com/Weathercold), we now
have a Nix flake to build AIRI, which is a great addition to the
cross-platform compatibility. It works even on macOS.

We are waiting the final Pull Request to be merged into nix-pkgs,
but you can try it out with the following command:

```bash
nix run --extra-experimental-features 'nix-command flakes' github:moeru-ai/airi
```

### Unified build pipeline

Previously the build pipeline for testing, staging and releasing were all
different, which was a nightmare for me to decide to publish new version,
cause we weren't sure if the pipeline will succeed or not.

While Tauri brought us a lot of benefits of cross-platform compatibility,
and the powerful abilities to use Rust to syscall and integrate to native
OS features...

Initially, in the early stage of v0.7 development, I introduced
[huggingface/candle](https://github.com/huggingface/candle) for inference
engine implementation for ASR/STT pipeline, but it depended on NVIDIA CUDA,
so the build was really a mess, where incompatibilities everywhere.

But it's now a lot better, we have a scheduled build pipeline that runs
the same scripts and workflow steps as releasing one every day.
(Which you may heard it as `canary` or `nightly` builds.)

So technically, if you encountering any issues with the latest release,
you can always try the latest build from the `main` branch to try whether
we fixed it or not.

Nightly builds can be found at https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml

## Before ending...

New packages born between this release:

> Big shout out to [@sumimakito](https://github.com/sumimakito), she did so many fantastic things... I can't even count them all...

- [`@proj-airi/chromatic`](https://github.com/proj-airi/chromatic) (by [@sumimakito](https://github.com/sumimakito))
- [`@proj-airi/unocss-preset-chromatic`](https://github.com/proj-airi/chromatic) (by [@sumimakito](https://github.com/sumimakito))
- [`@moeru-ai/jem`](https://github.com/moeru-ai/inventory/tree/main/packages/jem-validator) (by [@LemonNekoGH](https://github.com/LemonNekoGH)), unified model catalog
- [`clustr`](https://github.com/sumimakito/clustr) (by [@sumimakito](https://github.com/sumimakito))
- [`@proj-airi/drizzle-orm-browser`](https://github.com/proj-airi/drizzle-orm-browser) (by me)

Side projects born between this release:

- [HuggingFace Inspector](https://hf-inspector.moeru.ai/) (https://github.com/moeru-ai/hf-inspector)
- [More candle examples about whisper & VAD, candle, burn, and ort](https://github.com/proj-airi/candle-examples)
- [(the Model Catalog) Inventory submission!](https://github.com/moeru-ai/inventory/pull/1) (by [@LemonNekoGH](https://github.com/LemonNekoGH))

We cannot cover everything in this DevLog, for details, you can always track and read back
at [Roadmap v0.7](https://github.com/moeru-ai/airi/issues/200) on our roadmap.

<div class="w-full flex flex-col items-center justify-center gap-3 py-3">
  <img src="./assets/relu-sticker-thinks.avif" alt="ReLU sticker thinks" class="w-30!" />
  <div class="text-center">
    <span class="block font-bold">Thanks for reading all the way down here!</span>
  </div>
</div>
