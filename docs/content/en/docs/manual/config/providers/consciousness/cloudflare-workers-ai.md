---
title: Cloudflare Workers AI
description: Configure the Cloudflare Workers AI chat model in AIRI
---

Cloudflare Workers AI uses account-level credentials. In addition to the API Token, AIRI requires a Cloudflare Account ID to locate your Workers AI resources.

::: info Why choose Cloudflare Workers AI?
If your model service has been deployed in a Cloudflare account, you can use Workers AI to directly reuse the account's Token and Account ID.
:::

## Step 1: Prepare credentials

1. Open [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) and create an API token with Workers AI access.
2. Copy the Token.
3. In the [Cloudflare Console](https://dash.cloudflare.com/), find and copy the Account ID.

::: warning safety reminder
API Token is bound to account permissions. Please follow the principle of least privilege and grant only the Workers AI permissions required by AIRI; do not publish Token or Account ID with public logs.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Provider → Chat → Cloudflare Workers AI**.
2. Fill in the **API Token** and **Account ID**.

## Step 3: Verify configuration

1. Confirm that the basic credentials verification is passed.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

If AIRI prompts that the credentials are invalid, check whether the Token permissions and Account ID are from the same Cloudflare account. This provider does not use an editable Base URL, so no fields should be populated with Worker URL or API paths.
