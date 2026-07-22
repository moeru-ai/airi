---
title: Browser-native speech synthesis (TTS)
description: Using browser-native speech synthesis in AIRI web
---

Browser-native speech synthesis uses AIRI's local model capabilities and does not require a cloud API key.

::: info Why choose browser-native speech synthesis?
If you use the web version and want to minimize sending texts to third-party voice providers, you can try this option.
:::

## Step 1: Confirm the browser environment

1. Use the AIRI web version; this service provider will not appear on the desktop.
2. Make sure the browser supports WebGPU or the device memory is at least 8 GB before this service provider card will be displayed.

::: warning device compatibility
This capability depends on browser and hardware conditions. If the service provider card does not appear or the model cannot be run, please use the cloud TTS or desktop local solution instead.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → Browser (Local)** in the web version.
2. Wait for the model to be prepared and select the model and tone.

## Step 3: Verify configuration

1. Select the service provider, model and sound in **Settings → Sound**.
2. Enter the short text and listen; if it can be played normally, it means the configuration is successful.

## Troubleshooting

When the card does not appear, check whether the current version is the web version and whether the device meets WebGPU or memory requirements. When the model cannot be run, use cloud TTS or desktop local solution instead.
