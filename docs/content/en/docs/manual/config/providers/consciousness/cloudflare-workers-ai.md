---
title: Cloudflare Workers AI
description: Configure Cloudflare Workers AI chat models in AIRI
---


Cloudflare Workers AI uses account-level credentials. In addition to the API token, AIRI also needs your Cloudflare Account ID to locate your Workers AI resources.


::: info Why choose Cloudflare Workers AI?


If your model services are deployed in a Cloudflare account, Workers AI lets you reuse that account's token and Account ID directly.


:::


## Step 1: Prepare Credentials


1. Open [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) and create an API token with Workers AI access.
2. Copy the token.
3. Find and copy your Account ID in the [Cloudflare console](https://dash.cloudflare.com/).


::: warning Security Reminder


API tokens are bound to account permissions. Follow the principle of least privilege and only grant AIRI the Workers AI permissions it needs; do not publish the token or Account ID together with public logs.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Cloudflare Workers AI**.
2. Fill in the **API Token** and **Account ID**.


## Step 3: Verify the Configuration


1. Confirm the basic credentials pass verification.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If AIRI reports invalid credentials, check separately whether the token permissions and the Account ID come from the same Cloudflare account. This provider does not use an editable Base URL, so you should not fill a Worker URL or API path into any field.

