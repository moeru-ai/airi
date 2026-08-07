---
title: Browser Local Speech Recognition (ASR/STT)
description: Use browser-local speech recognition in the AIRI web client
---


Browser-local speech recognition uses AIRI's local model capabilities and does not require a cloud API key.


::: info Why choose browser-local speech recognition?


If you use the web client and prefer to avoid sending audio to third-party providers, you can try this option.


:::


## Step 1: Confirm the Browser Environment


1. Use the AIRI web client; this provider does not appear on the desktop client.
2. Confirm the browser supports WebGPU, or the device has at least 8 GB of memory, for this provider card to appear.


::: warning Device Compatibility


Local models consume device resources. If the provider card does not appear or recognition cannot start, switch to the Web Speech API, cloud ASR, or the desktop local option instead.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Transcription → Browser (Local)** in the web client.
2. Fill in the Base URL of the local service that provides the model (often like `http://localhost:11434/v1` for a local Ollama server). This field is required — the provider has no built-in default.
3. Wait for the model to be ready, select a model, and enable it under **Settings → Hearing**.


## Step 3: Verify the Configuration


1. Allow the browser to access the microphone and do a short voice input.
2. If the transcribed text is displayed, the configuration was successful.


## Troubleshooting


If the card does not appear, check whether you are on the web client and whether the device meets the WebGPU or memory requirements. If recognition cannot start, check the browser's microphone permission.

