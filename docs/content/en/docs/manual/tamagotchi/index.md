---
title: Guide to Desktop version
description: How to use Tamagotchi version of Project AIRI
---

## I want to chat, now!

No problem, follow me:

- Complete the onboarding process

1. Choose your desired LLM / AI provider (in the demo video, I chose OpenRouter)
2. Input API Key to interact with LLM / AI (this serve as the brain / soul of your character)
3. Select the desired Chat model (in the demo video, I chose `DeepSeek V3 0324`)
4. Disable **Fade on Hover** mode from system tray
5. Hover to the model UI, click the chat bubble icon, this will bring up the Chat window
6. Input and Chat!

::: tip Using Ollama locally?
You will need to set the `OLLAMA_ORIGINS=*` system environment variable and restart the Ollama
application after finishes.
:::

<br />

<video controls autoplay loop muted>
 <source src="../../../../public/assets/tutorial-basic-setup-providers.mp4" type="video/mp4">
</video>

<br />

Well yeah, this is too quick, we bet you haven't figured out what is **Fade on Hover**,
and how to customize everything, right?

::: warning We are still in early stage of developing it, many things weren't fully available yet
Some of the features are not really ready, but we are working hard to make them true right now:

- Transcriptions
- Local Speech Synthesis (GPT-SoVITS, IndexTTS, etc.)
- Singing
- Configuring Discord from UI (but it works already and requires coding skills to set it up)
- Configuring Minecraft agent from UI (but it works already and requires coding skills to set it up)
:::

But first...

::: tip Thank you!

Thank you for downloading and trying it!
:::

After downloaded, start AIRI from anywhere. You will see the user interface consists of two parts:

- Onboarding / Wizard setup guide
- Model (capable of showing Live2D & VRM models)

![](../../../../public/assets/screenshot-ui.avif)

We have other options/commands in the system tray, including:

- Show / Hide
- Open Settings
- Auto positioning windows
- etc.

Let's get this started one by one by explaining basic concepts and features.

## Window control

We will go through the following ones:

- How to interact with the model window?
- How to move the model window?
- How to resize it?

### Fade on Hover

::: info TL;DR | Cheatsheet
To toggle this feature (be able to interact with model), use <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="I" inline-block>I</kbd> shortcut.

You can customize the key mapping in [Settings] -> [General] -> [Shortcuts]
:::

You will discover that when hovering to the model, the Live2D model fade out / disappears
and you cannot interact with it with cursor.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-180 translate-x--30 translate-y--2 lg:scale-150 lg:translate-x--40">
    <source src="../../../../public/assets/tutorial-basic-fade-on-hover.mp4" type="video/mp4">
  </video>
</div>

This is because by default, the **Fade on Hover** feature is enabled: which means,
whenever cursor hovers on top of the model window, it will fade out and your clicks passed
through the window entirely.

This is a quite powerful feature, you will find it more useful when use it more and more
while having the companion live by your side. Here are two scenarios we came up with:

#### Browsing CrunchyRoll

<video autoplay loop muted>
  <source src="../../../../public/assets/tutorial-demo-browsing-crunchy-roll.mp4" type="video/mp4">
</video>

#### Browsing Steam

<video autoplay loop muted>
  <source src="../../../../public/assets/tutorial-demo-browsing-steam.mp4" type="video/mp4">
</video>

it's easy to disable this feature.

There are two ways to disable this feature:

- System tray
- Shortcut

You can toggle this feature through:

1. Right click system tray icon
2. Click **Window mode**
3. Click **Fade on hover**

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-200 translate-x--35 translate-y--23 lg:scale-180 lg:translate-x--60 lg:translate-y--40">
    <source src="../../../../public/assets/tutorial-basic-disable-fade-on-hover.mp4" type="video/mp4">
  </video>
</div>

### Move the window

::: info TL;DR | Cheatsheet
To toggle this feature (be able to interact with model), use <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="N" inline-block>N</kbd> shortcut.

You can customize the key mapping in [Settings] -> [General] -> [Shortcuts]
:::

<br />

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-225 translate-x--45 translate-y--5 lg:scale-200 lg:translate-x--80 lg:translate-y--5">
    <source src="../../../../public/assets/tutorial-basic-move.mp4" type="video/mp4">
  </video>
</div>

### Resize the window

::: info TL;DR | Cheatsheet
To toggle this feature (be able to interact with model), use <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="A" inline-block>A</kbd> shortcut.

You can customize the key mapping in [Settings] -> [General] -> [Shortcuts]
:::

<br />

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-160 translate-x--20 lg:scale-150 lg:translate-x--40 lg:translate-y-10">
    <source src="../../../../public/assets/tutorial-basic-resize.mp4" type="video/mp4">
  </video>
</div>

## Chat

There is no direct option/command to summon the Chat window from system tray
right now, but we might add this in the future, currently, in order to open the
Chat window, you will need to toggle off the **Fade on Hover** mode.

::: info TL;DR | Cheatsheet
Shortcut for Fade on Hover is: <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="I" inline-block>I</kbd>.
:::

<br />

<video autoplay loop muted>
 <source src="../../../../public/assets/tutorial-basic-open-chat.mp4" type="video/mp4">
</video>
