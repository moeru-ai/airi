---
title: NVIDIA NIM
description: Configure NVIDIA NIM as a chat provider in AIRI
is_openai_compatible: true
---

NVIDIA NIM provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by NVIDIA NIM in Consciousness.

::: warning Desktop only
This provider is currently available only in the Electron desktop app. It is not exposed in AIRI Web.
:::

::: info Why choose NVIDIA NIM?
If you are already using model services on the NVIDIA NIM platform, you can connect the same set of credentials to AIRI.
:::

## Get the API key

1. Open [NVIDIA NIM Console](https://build.nvidia.com/).
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the NVIDIA console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → NVIDIA NIM**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://integrate.api.nvidia.com/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If pinging the API fails, please check the API key, available credit or quota, rate limits, and network connection. When the model list fails to load, you can manually enter the exact model ID provided by NVIDIA NIM on the Consciousness page.
