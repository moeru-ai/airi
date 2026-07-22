---
title: Microsoft Azure Speech（TTS）
description: Configure Microsoft Azure Speech synthesis in AIRI
---

Microsoft Azure Speech provides Azure speech synthesis capabilities in AIRI.

::: info Why choose Microsoft Azure Speech?
If your team already manages voice resources and region configurations in Azure, it's more convenient to use the same credentials.
:::

## Step 1: Prepare Azure Speech resources

1. Open and log in to the [Azure Portal](https://portal.azure.com/)，创建或打开 Speech resource.
2. Record the **API Key** and region of the resource; both must come from the same Speech resource.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Azure keys provide access to your speech resources. Do not submit, screenshot or share it.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → Microsoft / Azure Speech**.
2. Fill in the API Key and region information. The Base URL remains the interface default unless you are using a compatible gateway.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network, API Key and region are filled in correctly.
2. **Select model and tone**: After the test is successful, select the tone and enable it in **Settings → Speech**.
3. Enter the short text to listen and confirm that it can be played normally.

## Troubleshooting

When verification fails, the priority is to check whether the area is consistent with the Speech resource. When there is no sound, confirm that the sound has been selected in "Voice" and check whether the resource has available credit.
