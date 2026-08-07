---
title: OpenAI-compatible API (ASR/STT)
description: Configure OpenAI or an OpenAI-compatible API as a speech recognition provider in AIRI
---


This page covers configuring OpenAI or providers that offer an OpenAI-compatible transcription interface. After configuration, select a model under "Hearing" and test the microphone input.


::: info Why choose OpenAI-compatible ASR/STT?


If your speech recognition provider explicitly offers an OpenAI-compatible transcription interface, you can connect it to AIRI as described on this page. An API address ending in `/v1` or a key starting with `sk-` does not guarantee compatibility.


:::


## Step 1: Get an API Key


1. Sign in to the management console of the provider you chose.
2. Create an API key on the API keys or developer settings page.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the provider console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Transcription → OpenAI-compatible API**.
2. Fill in the API key and the ASR/STT model ID you want to use.
3. When using OpenAI's official service, enter `https://api.openai.com/v1/` as the Base URL. The OpenAI-compatible API provider requires a Base URL — there is no built-in default; when using a compatible service, fill in the API root address from the provider's documentation.


## Step 3: Verify the Configuration


1. Select the configured provider and model under "Hearing", and choose the audio input device.
2. Click "Start listening", then speak into the microphone or play some audio.
3. Confirm the text is output in real time in the transcription area; if the results are inaccurate, adjust the sensitivity and test again.


## Troubleshooting


If there are no text results, first confirm the system has granted AIRI microphone permission. When using a compatible service, confirm it explicitly supports the OpenAI transcription interface and the model ID you entered.

