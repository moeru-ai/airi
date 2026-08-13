---
title: n1n
description: Configuring the n1n chat model in AIRI
---

n1n provides API-compatible chat model access in AIRI.

::: info Why choose n1n?
If you use n1n's model service, you can fill in its service address and account credentials in AIRI.
:::

## Prepare service access method

1. Log in to [n1n](https://n1n.ai/), then confirm your service URL and whether an API key is required.

::: warning Credential security
Even though the API Key is optional, don't expose your private service address, access token, or gateway configuration.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → n1n**. The default Base URL is `https://api.n1n.ai/v1/`.
2. Fill in the API Key according to n1n’s current service requirements; if your deployment allows anonymous access, leave it blank according to the deployer’s instructions.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

When verification fails, check the service address, API Key, and deployer's access policy. If the service allows anonymous access, follow the deployer's instructions to leave the API Key blank and confirm that the address is accessible from the device running AIRI.
