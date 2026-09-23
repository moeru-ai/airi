---
title: Nano Banana (Artistry)
description: Configuring Nano Banana image generation in AIRI
---

Nano Banana uses a Google AI Studio API key to generate images. Configure it under **Settings → Providers → Artistry**, then enable it under **Settings → Modules → Artistry**.

::: info Why choose Nano Banana?
If you already have a Google AI Studio API Key and want to use AIRI's built-in Gemini image model and resolution options directly, you can select it.
:::

## Obtain API Key

1. Log in to [Google AI Studio API Keys](https://aistudio.google.com/app/apikey), then create an API key.
2. Confirm that the selected image model is available for your account and region.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke and create a new key in Google AI Studio.
:::

## Configure in AIRI

1. Open **Settings → Providers → Artistry → Nano Banana** and paste the API Key.
2. Select the default model: `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview` or `gemini-2.5-flash-image`.
3. Select a default resolution: 1K, 2K, or 4K.

## Verify configuration

1. Open **Settings → Modules → Artistry** and select **Nano Banana (Preview)**.
2. Under **Settings → Modules → Consciousness**, select a chat model that supports tool/function calling.
3. Return to chat and ask AIRI to generate a non-sensitive image.
4. A returned image confirms that the API key, model, resolution, and tool call work.

## Troubleshooting

When authentication fails, check whether the API key is valid. If image generation fails, check your Google AI Studio account, regional availability, and current model status, then try 1K resolution or another available model.
