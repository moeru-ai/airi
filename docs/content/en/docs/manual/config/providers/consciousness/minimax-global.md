---
title: MiniMax Global
description: Configure the overseas version of MiniMax in AIRI as a chat provider
is_openai_compatible: true
---

This page applies to API Keys created on the MiniMax overseas platform. Once configured, AIRI can use the chat model provided by MiniMax Global in Consciousness.

::: info Why choose MiniMax Global?
If you create an API Key on the MiniMax overseas platform or use an overseas Token Plan, you should choose MiniMax Global. Please use [MiniMax (Mainland China)](./minimax.md) for the Key created by the Chinese mainland platform; the API Key, billing and Base URL of the two platforms cannot be mixed.
:::

## Obtain API Key

1. Log in to [MiniMax Global Platform](https://platform.minimax.io/).
2. Create a pay-as-you-go API Key in **API Keys**; if using Token Plan, please obtain its dedicated Key on the corresponding subscription page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key on the MiniMax Global platform.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → MiniMax Global**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.minimax.io/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.
3. Select MiniMax Global and the model in **Settings → Modules → Consciousness** and send a short message to confirm that AIRI can reply.

## Troubleshooting

If pinging the API fails, confirm that the API key comes from the global platform, the Base URL is `https://api.minimax.io/v1/`, the account has available credit or quota, no rate limit is active, and the network can reach the service. A `401` response commonly means that a mainland-China key was paired with the global endpoint, or vice versa. If the model list fails to load, enter the exact model ID from MiniMax Global on the **Consciousness** page.
