---
title: Volcano Engine Coding Plan
description: Configuring the Volcano Engine Coding Plan chat model in AIRI
---

The Volcano Engine Coding Plan is available as an independent provider card in AIRI.

::: info Why choose Volcano Engine Coding Plan?
If your account uses the Volcano Engine Coding Plan, this card should be selected to match the corresponding service plan.
:::

## Step 1: Prepare Coding Plan credentials

1. Open the [Volcengine Console](https://console.volcengine.com/) and obtain the Coding Plan API key.

::: warning API Key Security
Do not submit API keys or endpoint credentials to the repository, take screenshots, or send them to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Providers → Chat → Volcengine Coding Plan** and enter the API key.
2. Keep the default Base URL unless the Coding Plan documentation provides another compatible API root. Models come from AIRI's static provider list; this form has no endpoint or model field.

## Step 3: Verify configuration

1. **Validate**: Save the configuration and run the validation shown on the provider page. Then select the provider and model under **Settings → Modules → Consciousness** and send a test message.
2. **Select Model**: After successful testing, select an available model in **Settings → Modules → Consciousness**.

## Troubleshooting

When validation fails, check that the API key belongs to an active Volcengine Coding Plan and that the Base URL is correct. If a listed model is denied, confirm that the plan grants access to it.
