---
title: Browser Web Speech API (ASR/STT)
description: Use the browser's built-in speech recognition in the AIRI web client
---


The Web Speech API uses the speech recognition capability provided by the browser and does not require a separate API key.


::: info Why choose the Web Speech API?


If you only want to quickly try voice input in the web client and your browser supports the Web Speech API, this is the option with the least configuration.


:::


## Step 1: Confirm Browser Support


1. Use the AIRI web client; the Web Speech API is not available on the desktop client (Electron).
2. Confirm the current browser supports the Web Speech API, and be prepared to grant microphone permission.


::: warning Browser Limitations


The Web Speech API only works in browser environments; the AIRI desktop client (Electron) does not support it. Recognition quality may differ across browsers, network environments, and languages.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Speech Recognition → Web Speech API** in the web client.
2. Select the recognition language, and, when needed, the continuous recognition and interim results options.


## Step 3: Verify the Configuration


1. Go to **Settings → Hearing**, select the Web Speech API and the audio input device.
2. Allow the browser to access the microphone and start a short voice input test.
3. If the transcribed text is displayed, the configuration was successful.


## Troubleshooting


If there are no text results, check the browser's microphone permission, the selected input device, and the recognition language. If the browser does not support this API, use local or cloud ASR instead.

