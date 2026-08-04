---
title: Browser Local Text-to-Speech (TTS)
description: Use browser-local text-to-speech in the AIRI web client
---


Browser-local text-to-speech uses AIRI's local model capabilities and does not require a cloud API key.


::: info Why choose browser-local text-to-speech?


If you use the web client and prefer to avoid sending text to third-party speech providers, you can try this option.


:::


## Step 1: Confirm the Browser Environment


1. Use the AIRI web client; this provider does not appear on the desktop client.
2. Confirm the browser supports WebGPU, or the device has at least 8 GB of memory, for this provider card to appear.


::: warning Device Compatibility


This capability depends on browser and hardware conditions. If the provider card does not appear or the model cannot run, switch to a cloud TTS or the desktop local option instead.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Text-to-Speech → Browser (Local)** in the web client.
2. Wait for the model to be ready, and select a model and voice.


## Step 3: Verify the Configuration


1. Select this provider, model, and voice under **Settings → Speech**.
2. Enter a short text and preview it; if it plays normally, the configuration was successful.


## Troubleshooting


If the card does not appear, check whether you are on the web client and whether the device meets the WebGPU or memory requirements. If the model cannot run, switch to a cloud TTS or the desktop local option.

