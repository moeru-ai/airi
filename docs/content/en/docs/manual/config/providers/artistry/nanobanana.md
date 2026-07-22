---
title: Nano Banana (Artistic Creation)
description: Configuring Nano Banana image generation in AIRI
---

Nano Banana uses the Google AI Studio API Key to generate images. After completing the configuration, you can select the service provider in **Settings → Art**.

::: info Why choose Nano Banana?
If you already have a Google AI Studio API Key and want to use AIRI's built-in Gemini image model and resolution options directly, you can select it.
:::

## Step 1: Obtain API Key

1. Open and log in [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)，创建 API Key.
2. Confirm that the selected image model is available for your account and region.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others. Once a key is compromised, immediately revoke and create a new key in Google AI Studio.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Art → Nano Banana** and paste the API Key.
2. Select the default model: `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview` or `gemini-2.5-flash-image`.
3. Select a default resolution: 1K, 2K, or 4K.

## Step 3: Verify configuration

1. Open **Settings → Art** and select **Nano Banana**.
2. Generate an image using a prompt word that does not contain sensitive information.
3. Successfully returning the image means that the API Key, model and resolution configuration are available.

## Troubleshooting

When authentication fails, check whether the API Key is valid. When a model is unavailable or the request is denied, check your Google AI Studio account, region availability, and current model status. When the build fails, switch to 1K resolution or another available model and try again.
