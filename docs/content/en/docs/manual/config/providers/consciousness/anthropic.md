---
title: Anthropic
description: Configuring the Anthropic Claude chat model in AIRI
---

Anthropic provider lets AIRI use the Claude chat model. AIRI uses Anthropic's API address and your API Key; the model list is built into AIRI, so there's no need to manually fill in a Base URL or model ID to get started.

::: info Why choose Anthropic?
If you are already using the Claude API, or want to use Claude models in AIRI, you can choose Anthropic directly.
:::

## Create API Key

1. Log in to the [Anthropic Console](https://platform.claude.com/settings/keys), create an API key, and confirm that the account has API access enabled.
2. Set an appropriate name, validity period, and quota limit for the key.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the Anthropic console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Anthropic**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.anthropic.com/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

Provider validation checks connectivity by sending a short chat request. If it fails, confirm that the API key is valid, the account has available credit and sufficient usage limits, no rate limit is active, and the network can reach the Anthropic API.

If the model selector does not show the expected model, first update AIRI or manually enter the exact model ID provided by Anthropic on the **Consciousness** page.
