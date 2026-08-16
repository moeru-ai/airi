---
title: Azure OpenAI
description: Configure Azure OpenAI chat model in AIRI
---

Azure OpenAI lets AIRI access models through your Azure resource endpoint and deployments.

::: info Why choose Azure OpenAI?
If your team already deploys models and manages permissions in Azure OpenAI, this is a straightforward way to onboard.
:::

## Prepare Azure OpenAI resources

1. Log in to the [Azure Portal](https://portal.azure.com/), then create or open an Azure OpenAI resource and obtain the endpoint and API key.

::: warning API Key Security
Do not commit the Azure API key, include it in screenshots, or share it with anyone.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Azure OpenAI** and enter the **API Key**.
2. Enter the complete Chat Completions URL provided by Azure. AIRI extracts the deployment name and `api-version` from the URL.

## Verify configuration

1. Wait for AIRI's automatic validation after entering the API key, endpoint, and deployment details.
2. Go to **Settings → Modules → Consciousness**, select Azure OpenAI and the corresponding deployment, then send a message to verify the configuration.

## Troubleshooting

If validation fails, confirm that the API Key, endpoint, deployment name, and `api-version` all belong to the same Azure OpenAI resource. Use the deployment name rather than the model's display name.
