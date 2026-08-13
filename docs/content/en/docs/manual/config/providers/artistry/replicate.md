---
title: Replicate (Artistry)
description: Configuring Replicate image generation in AIRI
---

Replicate lets AIRI generate images with cloud-hosted models. Configure it under **Settings → Providers → Artistry**, then enable it under **Settings → Modules → Artistry**.

::: info Why choose Replicate?
You can choose the cloud inference service if you don't want to deploy the image model yourself and want to choose from the models available in Replicate.
:::

## Obtain API Token

1. Log in to [Replicate API Tokens](https://replicate.com/account/api-tokens), then create an API token.
2. Confirm that the account has an available billing method or sufficient credit.
3. Copy the token and store it securely.

::: warning API Token Security
Do not commit, screenshot, or share API tokens. If a token is exposed, revoke it immediately and create a replacement in the Replicate console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Artistry → Replicate**.
2. Paste the API Token.
3. Enter a model ID. AIRI defaults to `black-forest-labs/flux-schnell`; use the exact ID shown on the Replicate model page if you select another model.
4. Set the default aspect ratio (default `16:9`) and number of inference steps (default 4) as needed.

## Verify configuration

1. Open **Settings → Modules → Artistry** and select **Replicate.ai (Cloud)**.
2. Under **Settings → Modules → Consciousness**, select a chat model that supports tool/function calling.
3. Return to chat and ask AIRI to generate a non-sensitive image.
4. A returned image confirms that the token, model ID, account quota, and tool call work.

## Troubleshooting

If authentication fails, confirm that the complete token was pasted. If a request is denied, check account quota, model access, and the model ID. If the result is unexpected, confirm the aspect ratios and parameter ranges supported by that model, then adjust the inference steps or choose another model.
