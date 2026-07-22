---
title: Azure AI Foundry
description: Configure Azure AI Foundry chat model in AIRI
---

Azure AI Foundry requires the resource name, model deployment information, and API Key.

::: info Why choose Azure AI Foundry?
If your model deployment and access control have been completed in Azure AI Foundry, you can use this service provider to connect directly to the deployment.
:::

## Step 1: Prepare Azure AI Foundry resources

1. Open and log in to [Azure AI Foundry](https://ai.azure.com/)，创建或打开目标项目并取得 API Key, resource name and model deployment information.

::: warning API Key Security
Do not submit your Azure API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Azure AI Foundry** and fill in the **API Key**, resource name and model ID.
2. If the console requires a specific API version, please fill it in the interface; do not mistake the common model name for the deployment name.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network, resource name and API Key are correct.
2. **Select Model**: After successful testing, select an available deployment, and then go to **Settings → Awareness** to enable it.

## Troubleshooting

When validation fails, check that the API Key, resource name, deployment name, and API version are all from the same Azure AI Foundry project. Please use the deployment name, not the model name which is for presentation only.
