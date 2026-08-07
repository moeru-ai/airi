---
title: MiniMax Speech (TTS)
description: Configure MiniMax text-to-speech in AIRI
---


MiniMax Speech can provide text-to-speech models and preset voices in AIRI.


::: info Why choose MiniMax Speech?


If you already use MiniMax and want to use its Chinese or English preset voices directly, you can select it.


:::


## Step 1: Get an API Key


1. Open and sign in to the [MiniMax open platform](https://platform.minimaxi.com/) and enable API access.
2. Create a key on the API key management page.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Speech → MiniMax Speech** and paste the API key.
2. Keep the default service address `https://api.minimax.io`, unless the provider explicitly offers another address.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model and Voice**: after the test succeeds, choose an available model and voice such as `speech-2.8-hd` or `speech-2.8-turbo`, then enable it under **Settings → Speech**.
3. Enter a short text and preview it to confirm it plays normally.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If a model or voice is unavailable, follow the list currently open on the MiniMax account.

