---
title: Volcengine (TTS)
description: Configure Volcengine text-to-speech in AIRI
---


Volcengine text-to-speech requires an API key and application information in AIRI.


::: info Why choose Volcengine?


If you have already created a speech application on Volcengine and manage voice resources there, you can reuse this configuration in AIRI.


:::


## Step 1: Prepare Application Credentials


1. Open and sign in to the [Volcengine console](https://console.volcengine.com/) and create or open a speech application.
2. Copy the application's **App ID** and create the corresponding **API Key**.
3. Confirm both pieces of information come from the same account and application configuration.


::: warning API Key Security


Do not expose the API key or the credentials corresponding to the App ID; if they leak, replace the key immediately in the provider console.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Speech → Volcengine**.
2. Fill in the API key and App ID; use the default Base URL unless you use a compatible gateway.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test whether the network, API key, and App ID are correct.
2. **Select Model and Voice**: after the test succeeds, choose a voice, then enable it under **Settings → Speech**.
3. Enter a short text and preview it to confirm it plays normally.


## Troubleshooting


If verification fails, check whether the App ID and API key come from the same application. If there is no sound, confirm the application has text-to-speech enabled and a voice is selected.

