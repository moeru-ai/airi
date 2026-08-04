---
title: Azure AI Foundry
description: Configure Azure AI Foundry chat models in AIRI
---


Azure AI Foundry requires a resource name, model deployment information, and an API key.


::: info Why choose Azure AI Foundry?


If your model deployments and access control are already set up in Azure AI Foundry, you can use this provider to connect to the deployment directly.


:::


## Step 1: Prepare Azure AI Foundry Resources


1. Open and sign in to [Azure AI Foundry](https://ai.azure.com/), create or open the target project, and obtain the API key, resource name, and model deployment information.


::: warning API Key Security


Do not commit the Azure API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Azure AI Foundry** and fill in the **API Key**, resource name, and model ID.
2. If the console requires a specific API version, fill it in on the page; do not mistake a regular model name for a deployment name.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test whether the network, resource name, and API key are correct.
2. **Select Model**: after the test succeeds, choose an available deployment, then enable it under **Settings → Consciousness**.


## Troubleshooting


If verification fails, check that the API key, resource name, deployment name, and API version all come from the same Azure AI Foundry project. Use the deployment name, not the display-only model name.

