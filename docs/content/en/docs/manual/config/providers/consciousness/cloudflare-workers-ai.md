---
title: Cloudflare Workers AI
description: Configure the Cloudflare Workers AI chat model in AIRI
---

Cloudflare Workers AI uses account-level credentials. In addition to the API Token, AIRI requires a Cloudflare Account ID to locate your Workers AI resources.

::: info Why choose Cloudflare Workers AI?
If your model service has been deployed in a Cloudflare account, you can use Workers AI to directly reuse the account's Token and Account ID.
:::

## Prepare credentials

1. Open [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) and create an API token with Workers AI access.
2. Copy the Token.
3. In the [Cloudflare Console](https://dash.cloudflare.com/), find and copy the Account ID.

::: warning Safety reminder
API Token is bound to account permissions. Please follow the principle of least privilege and grant only the Workers AI permissions required by AIRI; do not publish Token or Account ID with public logs.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Cloudflare Workers AI**.
2. Fill in the **API Token** and **Account ID**.

## Verify configuration

1. Wait for AIRI's automatic required-field check to pass. This check only confirms that both fields contain a value; it does not contact Cloudflare or verify the credentials.
2. Click **Select Model →** to open **Settings → Modules → Consciousness**, then select Cloudflare Workers AI and an available model.
3. Return to the chat and send a test message. A successful response confirms that the Account ID, API Token permissions, and selected model work together.

## Troubleshooting

If the required-field check fails, confirm that both **API Token** and **Account ID** contain a value. If the test message fails, check that the Token has Workers AI permissions and belongs to the same Cloudflare account as the Account ID. This provider does not use an editable Base URL, so do not enter a Worker URL or API path.
