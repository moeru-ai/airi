---
title: Volcano Engine (TTS)
description: Configuring Volcano Engine Speech Synthesis in AIRI
---

Volcano engine speech synthesis requires filling in the API Key and application information in AIRI.

::: info Why choose Volcano Engine?
If you have created a voice application and managed sound resources in the Volcano Engine, you can reuse this set of configurations in AIRI.
:::

## Step 1: Prepare application credentials

1. Open and log in to [Volcano Engine Console] (https://console.volcengine.com/)，创建或打开语音应用。
2. Copy the **App ID** of the application and create the corresponding **API Key**.
3. Confirm that both pieces of information come from the same account and application configuration.

::: warning API Key Security
Do not disclose the credentials corresponding to the API Key or App ID; immediately replace the key in the service provider console after leakage.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → Volcano Engine**.
2. Fill in the API Key and App ID; the Base URL uses the interface default value unless you use a compatible gateway.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network, API Key and App ID are filled in correctly.
2. **Select model and tone**: After the test is successful, select the tone, and then go to **Settings → Sound** to enable it.
3. Enter the short text to listen and confirm that it can be played normally.

## Troubleshooting

When verification fails, check whether the App ID and API Key are from the same application. When there is no sound, make sure the app has enabled speech synthesis and selected a tone.
