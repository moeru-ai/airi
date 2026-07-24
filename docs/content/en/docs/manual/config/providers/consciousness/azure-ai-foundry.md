---
title: Azure AI Foundry
description: Configure Azure AI Foundry chat model in AIRI
---

Azure AI Foundry requires the resource name, model deployment information, and API Key.

::: info Why choose Azure AI Foundry?
If your model deployment and access control have been completed in Azure AI Foundry, you can use this service provider to connect directly to the deployment.
:::

## Step 1: Prepare Azure AI Foundry resources

1. Open and log in to [Azure AI Foundry](https://ai.azure.com/), then create or open the target project and obtain the API key, resource name, and model deployment information.

::: warning API Key Security
Do not submit your Azure API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Azure AI Foundry** and fill in the **API Key**, resource name and model ID.
2. If the console requires a specific API version, please fill it in the interface; do not mistake the common model name for the deployment name.

## Step 3: Verify configuration

1. After you fill in the required fields, AIRI automatically checks that the API Key, resource name, and model ID are present. This check does not test the network connection or credentials.
2. Go to **Settings → Consciousness**, select the Azure AI Foundry provider and deployment, then send a test message to confirm that the deployment can respond.

## Troubleshooting

When validation fails, check that the API Key, resource name, deployment name, and API version are all from the same Azure AI Foundry project. Please use the deployment name, not the model name which is for presentation only.
