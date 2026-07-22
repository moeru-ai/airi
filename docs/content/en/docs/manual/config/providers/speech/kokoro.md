---
title: Kokoro (local TTS)
description: Configuring native Kokoro speech synthesis in AIRI
---

Kokoro runs speech synthesis as a native model in AIRI.

::: info Why choose Kokoro?
If you want to process speech content locally and the device meets the model running conditions, you can choose Kokoro.
:::

## Step one: Prepare local operating environment

1. Open AIRI in an environment that supports WebGPU; when using it for the first time, wait for the model download to complete.
2. This option does not require a cloud API Key, but will use the local download space, memory and computing resources.

::: warning local resource usage
Local models take up download space, memory, and computing resources. Do not force enable when device resources are insufficient.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → Kokoro**.
2. Select an available Kokoro model provided by AIRI.

## Step 3: Verify configuration

1. **Select model and tone**: After the model is prepared, select the tone, and then go to **Settings → Sound** to enable it.
2. Enter the short text to listen; if it can be played normally, it means the model is ready.

## Troubleshooting

When the model cannot be loaded, check whether the browser supports WebGPU and whether the device resources are sufficient, and reopen the page and wait for the download to complete.
