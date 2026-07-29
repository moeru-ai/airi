---
title: Browser Web Speech API (ASR/STT)
description: Using in-browser speech recognition with AIRI Web
---

The Web Speech API uses the speech recognition capabilities provided by the browser and does not require a separate application for an API Key.

::: info Why choose Web Speech API?
If you're just trying out speech input quickly on the web, and your browser supports the Web Speech API, this is the minimal configuration option.
:::

## Confirm browser support

1. Use AIRI Web. The Web Speech API provider is not available in AIRI Desktop (Electron).
2. Confirm that the current browser supports the Web Speech API and is ready to allow microphone permissions.

::: warning browser restrictions
The Web Speech API is only available in browser environments and is not supported by the desktop version of AIRI (Electron). Recognition capabilities may vary across browsers, network environments and languages.
:::

## Configure in AIRI

1. Open **Settings → Providers → Transcription → Web Speech API** in the web version.
2. Select **Recognition Language**, then configure **Continuous Recognition** and **Show Interim Results** as needed.

## Verify configuration

1. Go to **Settings → Modules → Hearing** and select Web Speech API and Audio Input Device.
2. Allow the browser to access the microphone and start a short voice input test.
3. If the transcribed text can be displayed, the configuration is successful.

## Troubleshooting

When there are no text results, check browser microphone permissions, selected input device, and recognized language. If your browser does not support this API, please use local or cloud ASR instead.
