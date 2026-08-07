---
title: Microsoft Azure Speech (TTS)
description: Configure Microsoft Azure Speech text-to-speech in AIRI
---


Microsoft Azure Speech can provide Azure text-to-speech capabilities in AIRI.


::: info Why choose Microsoft Azure Speech?


If your team already manages speech resources and region configuration in Azure, reusing the same credentials is more convenient.


:::


## Step 1: Prepare an Azure Speech Resource


1. Open and sign in to the [Azure Portal](https://portal.azure.com/) and create or open a Speech resource.
2. Note the resource's **API Key** and its region; both must come from the same Speech resource.
3. Copy the key and store it securely.


::: warning API Key Security


The Azure key can access your speech resource. Do not commit, screenshot, or share it.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Speech → Microsoft / Azure Speech**.
2. Fill in the API key and region information. Keep the default Base URL unless you use a compatible gateway.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test whether the network, API key, and region are correct.
2. **Select Model and Voice**: after the test succeeds, choose a voice and enable it under **Settings → Speech**.
3. Enter a short text and preview it to confirm it plays normally.


## Troubleshooting


If verification fails, first check whether the region matches the Speech resource. If there is no sound, confirm a voice is selected under "Speech" and check whether the resource has available credits.

