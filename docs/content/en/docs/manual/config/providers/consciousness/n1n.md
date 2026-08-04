---
title: n1n
description: Configure n1n chat models in AIRI
---


n1n provides a compatible API for chat model access in AIRI.


::: info Why choose n1n?


If you use n1n's model service, you can fill in its service address and account credentials in AIRI.


:::


## Step 1: Prepare Service Access


1. Open and sign in to [n1n](https://n1n.ai/) and confirm your service address and whether an API key is required.


::: warning Credential Security


Even if the API key is optional, do not expose your private service address, access tokens, or gateway configuration publicly.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → n1n**. The default Base URL is `https://api.n1n.ai/v1/`.
2. Fill in the API key per n1n's current service requirements; if your deployment allows anonymous access, leave it empty per the deployment's instructions.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test whether the network, service address, and credentials are correct.
2. **Select Model**: after the test succeeds, choose a model, then enable it under **Settings → Consciousness**.


## Troubleshooting


If verification fails, check the service address, API key, and the deployment's access policy. If the service allows anonymous access, leave the API key empty per the deployment's instructions and confirm the address is reachable from the device running AIRI.

