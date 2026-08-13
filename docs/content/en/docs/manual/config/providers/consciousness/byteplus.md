---
title: BytePlus
description: Configuring the BytePlus chat model in AIRI
---

BytePlus uses Ark-compatible chat service configuration in AIRI.

::: info Why choose BytePlus?
Use this provider when your BytePlus account has Ark API access.
:::

## Prepare BytePlus credentials

1. Log in to the [BytePlus ModelArk console](https://console.byteplus.com/ark/region%3Aark%2Bap-southeast-1/apikey) and create an API key.

::: warning API Key Security
Do not commit API keys or endpoint credentials, include them in screenshots, or share them with anyone.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → BytePlus** and enter the API key.
2. Keep the default Base URL unless BytePlus documents another compatible API root. Models are selected from AIRI's provider list; this form has no Endpoint ID or model input.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

When validation fails, check the API key, Base URL, account access, and network connection. If a model is unavailable, select one from the list exposed by the provider.
