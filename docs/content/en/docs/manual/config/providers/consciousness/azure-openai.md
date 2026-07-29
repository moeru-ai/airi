---
title: Azure OpenAI
description: Configure Azure OpenAI chat model in AIRI
---

Azure OpenAI access models through your Azure resource endpoints and deployments.

::: info Why choose Azure OpenAI?
If your team already deploys models and manages permissions in Azure OpenAI, this is a straightforward way to onboard.
:::

## Prepare Azure OpenAI resources

1. Log in to the [Azure Portal](https://portal.azure.com/), then create or open an Azure OpenAI resource and obtain the endpoint and API key.

::: warning API Key Security
Do not submit your Azure API Key to the repository, take screenshots, or send it to others.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Azure OpenAI**, fill in the **API Key** and Azure OpenAI endpoint.
2. It is recommended to fill in the complete Chat Completions address provided by the console; if the address contains the deployment name and `api-version`, AIRI will identify the configuration accordingly.

## Verify configuration

1. Wait for AIRI's automatic validation after entering the API key, endpoint, and deployment details.
2. Go to **Settings → Modules → Consciousness**, select Azure OpenAI and the corresponding deployment, then send a message to verify the configuration.

## Troubleshooting

When validation fails, check that the API Key, endpoint, deployment name, and `api-version` are all from the same Azure OpenAI resource. Please use the deployment name, not the model name which is for presentation only.
