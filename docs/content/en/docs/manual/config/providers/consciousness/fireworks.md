---
title: Fireworks AI
description: Configure Fireworks AI as a chat provider in AIRI
is_openai_compatible: true
---

Fireworks AI provides a chat API that is compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by Fireworks AI in Consciousness.

::: info Why choose Fireworks AI?
If you already manage models or inference services in Fireworks AI, you can directly reuse the same set of API credentials.
:::

## Get the API key

1. Follow the [Fireworks AI onboarding guide](https://docs.fireworks.ai/getting-started/onboarding) to create an API key.
2. Create a new API Key.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the Fireworks AI console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Fireworks.ai**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.fireworks.ai/inference/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If pinging the API fails, please check the API key, available credit or quota, rate limits, and network connection. When the model list fails to load, you can manually enter the exact model ID provided by Fireworks AI on the Consciousness page.
