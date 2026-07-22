---
title: Replicate (Artistic Creation)
description: Configuring Replicate image generation in AIRI
---

Replicate lets AIRI generate models using images in the cloud. After completing the configuration, you can select Replicate as the image generation source in **Settings → Art**.

::: info Why choose Replicate?
You can choose the cloud inference service if you don't want to deploy the image model yourself and want to choose from the models available in Replicate.
:::

## Step 1: Obtain API Token

1. Open and log in [Replicate API Tokens](https://replicate.com/account/api-tokens)，创建 API Token.
2. Confirm that the account has been configured with available billing methods or limits.
3. Copy the Token and save it properly.

::: warning API Token Security
Do not submit Tokens to the repository, take screenshots, or send them to others. After the leak, please immediately revoke and create a new Token in the Replicate console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Art → Replicate**.
2. Paste the API Token.
3. Fill in the default model ID. The default value of AIRI is `black-forest-labs/flux-schnell`; please refer to the exact ID displayed on the Replicate model page.
4. Set the default screen ratio (default `16:9`) and number of inference steps (default 4) as needed.

## Step 3: Verify configuration

1. Open **Settings → Art** and select **Replicate**.
2. Generate an image using a prompt word that does not contain sensitive information.
3. Successfully returning the image means that the Token, model ID and account quota are available.

## Troubleshooting

When authentication fails, check whether the Token is pasted completely. When a request is denied or fails, check the account limit, model access permissions, and model ID. When the generated results do not meet expectations, first confirm the scale and parameter range supported by the model, and then reduce the number of inference steps or replace the model.
