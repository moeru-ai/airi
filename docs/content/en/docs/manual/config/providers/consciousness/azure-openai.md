---
title: Azure OpenAI
description: Configure Azure OpenAI chat model in AIRI
---

Azure OpenAI access models through your Azure resource endpoints and deployments.

::: info Why choose Azure OpenAI?
If your team already deploys models and manages permissions in Azure OpenAI, this is a straightforward way to onboard.
:::

## Step 1: Prepare Azure OpenAI resources

1. Open and log in to the [Azure Portal](https://portal.azure.com/), then create or open an Azure OpenAI resource and obtain the endpoint and API key.

::: warning API Key Security
Do not submit your Azure API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Azure OpenAI**, fill in the **API Key** and Azure OpenAI endpoint.
2. It is recommended to fill in the complete Chat Completions address provided by the console; if the address contains the deployment name and `api-version`, AIRI will identify the configuration accordingly.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network, endpoint, and API Key are correct.
2. **Select model**: After the test is successful, select the corresponding deployment, and then go to **Settings → Consciousness** to enable it.

## Troubleshooting

When validation fails, check that the API Key, endpoint, deployment name, and `api-version` are all from the same Azure OpenAI resource. Please use the deployment name, not the model name which is for presentation only.
