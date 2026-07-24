---
title: Google Gemini（TTS）
description: Configuring Google Gemini Audio Speech Synthesis in AIRI
---

Google Gemini Audio speech synthesis uses Gemini credentials and a model that supports audio output.

::: info Why choose Google Gemini?
If you have configured Google Gemini in AIRI and want to use the audio output capability under the same service provider, you can select this option.
:::

## Step 1: Obtain API Key

1. Open and log in to [Google AI Studio](https://aistudio.google.com/app/apikey), then create an API key.
2. Confirm that the account can use the Gemini model that supports audio output.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the Gemini API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Fill in the Gemini API Key in **Settings → Service Provider → Speech Synthesis → Google Gemini**.
2. Keep the interface default Base URL unless you are using an enterprise gateway or compatible proxy.

## Step 3: Verify configuration

1. Select a model and any available voice in the provider settings.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Troubleshooting

When verification fails, check the API Key, account region availability, and network connectivity. When the request is successful but there is no sound, confirm that the selected model does support audio output.
