---
title: AnonRouter
description: Configure AnonRouter as a chat provider in AIRI
is_openai_compatible: true
---

AnonRouter exposes an OpenAI-compatible chat API. AIRI loads the available models from AnonRouter instead of using a fixed model list.

## Get the API key

1. Go to [AnonRouter](https://anonrouter.ai/) to register an account and create an API Key.
2. Enable **OpenAI-compatible access** for the key. See [compatibility mode](https://docs.anonrouter.ai/compatibility).
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it. If the key is compromised, revoke it in the AnonRouter dashboard. Then create a new key.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → AnonRouter**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.anonrouter.ai/v1`.

## Verify configuration

1. AIRI validates the configuration automatically. If **Ping API** appears, use it for a live request test.
2. After validation succeeds, press **Select Model →** to open **Settings → Modules → Consciousness**.
3. Select AnonRouter and a model.

Use the exact model ID from the AnonRouter catalog, for example `openai/gpt-4o-mini`.

## Troubleshooting

If the API check fails, inspect the API key, available credit or quota, rate limits, and network connection.
If AIRI cannot load the model list, enter the exact model ID manually on the **Consciousness** page.
If AnonRouter returns `permission_error`, enable OpenAI-compatible access for the key or create a compatibility-enabled key.
