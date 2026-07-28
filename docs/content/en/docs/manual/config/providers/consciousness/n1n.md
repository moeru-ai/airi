---
title: n1n
description: Configuring the n1n chat model in AIRI
---

n1n provides API-compatible chat model access in AIRI.

::: info Why choose n1n?
If you use n1n's model service, you can fill in its service address and account credentials in AIRI.
:::

## Step 1: Prepare service access method

1. Open and log in [n1n](https://n1n.ai/), then confirm your service URL and whether an API key is required.

::: warning Credential security
Even though the API Key is optional, don't expose your private service address, access token, or gateway configuration.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Providers → Chat → n1n**. The default Base URL is `https://api.n1n.ai/v1/`.
2. Fill in the API Key according to n1n’s current service requirements; if your deployment allows anonymous access, leave it blank according to the deployer’s instructions.

## Step 3: Verify configuration

1. **Validate**: Save the configuration and run the validation shown on the provider page. Then select the provider and model under **Settings → Modules → Consciousness** and send a test message.
2. **Select model**: After the test is successful, select the model, and then go to **Settings → Modules → Consciousness** to enable it.

## Troubleshooting

When verification fails, check the service address, API Key, and deployer's access policy. If the service allows anonymous access, follow the deployer's instructions to leave the API Key blank and confirm that the address is accessible from the device running AIRI.
