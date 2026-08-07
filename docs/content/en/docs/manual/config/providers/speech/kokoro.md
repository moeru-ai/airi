---
title: Kokoro (Local TTS)
description: Configure local Kokoro text-to-speech in AIRI
---


Kokoro runs text-to-speech in AIRI as a local model.


::: info Why choose Kokoro?


If you want to process speech content locally and your device meets the model's runtime requirements, you can select Kokoro.


:::


## Step 1: Prepare the Local Runtime Environment


1. Open AIRI in an environment that supports WebGPU; on first use, wait for the model download to finish.
2. This option does not require a cloud API key, but it uses local download space, memory, and computing resources.


::: warning Local Resource Usage


The local model consumes download space, memory, and computing resources. Do not force-enable it when device resources are insufficient.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Speech → Kokoro**.
2. Select one of the available Kokoro models provided by AIRI.


## Step 3: Verify the Configuration


1. **Select Model and Voice**: once the model is ready, choose a voice, then enable it under **Settings → Speech**.
2. Enter a short text and preview it; if it plays normally, the model is ready.


## Troubleshooting


If the model cannot be loaded, check whether the browser supports WebGPU, whether device resources are sufficient, and reopen the page and wait for the download to finish.

