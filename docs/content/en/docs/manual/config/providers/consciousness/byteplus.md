---
title: BytePlus
description: Configure BytePlus chat models in AIRI
---


BytePlus uses an Ark-compatible chat service configuration in AIRI.


::: info Why choose BytePlus?


If you have already created an Ark model endpoint on BytePlus, you can use that endpoint and its credentials in AIRI directly.


:::


## Step 1: Prepare BytePlus Credentials


1. Open and sign in to the [BytePlus Console](https://console.byteplus.com/), and create or view the Ark endpoint and its access credentials.


::: warning API Key Security


Do not commit the API key or endpoint credentials to the repository, put them in screenshots, or share them with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → BytePlus** and fill in the API key, endpoint, or model information per the BytePlus console.
2. Do not guess the Endpoint ID; copy the actual identifier of the endpoint you created in the console.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test whether the network and credentials are correct.
2. **Select Model**: after the test succeeds, go to **Settings → Consciousness** and select the provider and model.


## Troubleshooting


If verification fails, check that the API key, Endpoint ID, and model information come from the same BytePlus Ark project. Do not guess the Endpoint ID manually; copy the actual identifier from the console.

