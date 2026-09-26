---
title: AnonRouter
description: Configure AnonRouter as a chat provider in AIRI
is_openai_compatible: true
---

AnonRouter is a model router that exposes a chat API compatible with the OpenAI format. After completing the configuration, select an AnonRouter model under **Settings → Modules → Consciousness**.

::: info Why choose AnonRouter?
If you already have an AnonRouter API Key, or want to use the models it routes to, you can choose this service provider directly.
:::

## Get the API key

1. Go to [AnonRouter](https://anonrouter.ai/) to register an account and create an API Key.
2. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the AnonRouter dashboard.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → AnonRouter**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.anonrouter.ai/v1`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

Model IDs use the `creator/model` format, for example `openai/gpt-4o-mini`. The AnonRouter model catalog shows the exact ID for each model.

## Troubleshooting

If the API check fails, verify the API key, available credit or quota, rate limits, and network connection. If AIRI cannot load the model list, enter the exact model ID provided by AnonRouter manually on the **Consciousness** page.

AnonRouter also has a private flow that uses single-use tickets. AIRI uses compatibility mode, which sends the API key as a bearer token. If the API returns a `permission_error`, enable compatibility mode for the key or create a compatible inference key.
