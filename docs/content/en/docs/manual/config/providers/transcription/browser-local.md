---
title: Browser native speech recognition (ASR/STT)
description: Using browser-native speech recognition in AIRI web
---

Browser local speech recognition uses AIRI's local model capabilities and does not require a cloud API key.

::: info Why choose browser-native speech recognition?
If you use the web version and want to minimize sending audio to third-party providers, you can try this option.
:::

## Step 1: Confirm the browser environment

1. Use the AIRI web version; this service provider will not appear on the desktop.
2. Make sure the browser supports WebGPU or the device memory is at least 8 GB before this service provider card will be displayed.

::: warning device compatibility
Local models consume device resources. If the service provider card does not appear or the recognition cannot be started, please use the Web Speech API, cloud ASR or desktop local solution instead.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Voice Recognition → Browser (Local)** in the web version.
2. Wait for the model to be prepared, select the model, and enable it in **Settings → Hearing**.

## Step 3: Verify configuration

1. Allow the browser to access the microphone and perform a short voice input.
2. If the transcribed text can be displayed, the configuration is successful.

## Troubleshooting

When the card does not appear, check whether the current version is the web version and whether the device meets WebGPU or memory requirements. When recognition fails to start, check browser microphone permissions.
