---
title: Anthropic
description: Configuring the Anthropic Claude chat model in AIRI
---

Anthropic provider lets AIRI use the Claude chat model. AIRI uses Anthropic's API address and your API Key; the model list is built into AIRI, so there's no need to manually fill in a Base URL or model ID to get started.

::: info Why choose Anthropic?
If you are already using the Claude API, or want to use Claude models in AIRI, you can choose Anthropic directly.
:::

## Step 1: Create API Key

1. Open and sign in to [Anthropic Console](https://platform.claude.com/settings/keys), create an API key, and confirm that the account has API access enabled.
2. Set an appropriate name, validity period, and quota limit for the key.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the Anthropic console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Providers → Chat → Anthropic**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.anthropic.com/v1/`.

## Step 3: Verify configuration

1. **Validate**: Save the configuration and run the validation shown on the provider page. Then select the provider and model under **Settings → Modules → Consciousness** and send a test message.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

The provider validation checks network connectivity and sends a short chat request. If it fails, please confirm that the API Key is available, the account has a limit, and check whether the network can access the Anthropic API.

If the model selector does not show the expected model, first update the AIRI or manually enter the exact model ID provided by the service provider on the Consciousness page.
