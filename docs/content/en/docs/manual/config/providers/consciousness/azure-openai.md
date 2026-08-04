---
title: Azure OpenAI
description: Configure Azure OpenAI chat models in AIRI
---


Azure OpenAI accesses models through your Azure resource endpoint and deployments.


::: info Why choose Azure OpenAI?


If your team already deploys models and manages permissions in Azure OpenAI, this is a direct way to connect.


:::


## Step 1: Prepare Azure OpenAI Resources


1. Open and sign in to the [Azure Portal](https://portal.azure.com/), create or open an Azure OpenAI resource, and obtain the endpoint and API key.


::: warning API Key Security


Do not commit the Azure API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Azure OpenAI** and fill in the **API Key** and the Azure OpenAI endpoint.
2. We recommend entering the complete Chat Completions address from the console; if the address contains the deployment name and `api-version`, AIRI will recognize the configuration from it.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test whether the network, endpoint, and API key are correct.
2. **Select Model**: after the test succeeds, choose the corresponding deployment, then enable it under **Settings → Consciousness**.


## Troubleshooting


If verification fails, check that the API key, endpoint, deployment name, and `api-version` all come from the same Azure OpenAI resource. Use the deployment name, not the display-only model name.

