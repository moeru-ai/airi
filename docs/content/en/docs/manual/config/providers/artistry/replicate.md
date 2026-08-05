---
title: Replicate (Artistry)
description: Configure Replicate image generation in AIRI
---


Replicate lets AIRI use cloud image generation models. After configuration, you can select Replicate as the image generation source under **Settings → Art**.


::: info Why choose Replicate?


If you do not want to deploy image models yourself and prefer to choose cloud inference services from the models available on Replicate, you can select it.


:::


## Step 1: Get an API Token


1. Open and sign in to [Replicate API Tokens](https://replicate.com/account/api-tokens) and create an API token.
2. Confirm the account has a valid billing method or credits configured.
3. Copy the token and store it securely.


::: warning API Token Security


Do not commit the token to the repository, put it in screenshots, or share it with others. If it leaks, revoke it immediately in the Replicate console and create a new token.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Art → Replicate**.
2. Paste the API token.
3. Fill in the default model ID. The AIRI default is `black-forest-labs/flux-schnell`; use the exact ID shown on the Replicate model page.
4. Set the default aspect ratio (default `16:9`) and inference steps (default 4) as needed.


## Step 3: Verify the Configuration


1. Open **Settings → Art** and select **Replicate**.
2. Generate an image using a prompt that contains no sensitive information.
3. If an image is returned successfully, the token, model ID, and account credits work.


## Troubleshooting


If authentication fails, check whether the token was pasted in full. If requests are rejected or fail, check the account credits, model access permissions, and model ID. If the generated result is not as expected, first confirm the aspect ratios and parameter ranges supported by the model, then lower the inference steps or switch models.

