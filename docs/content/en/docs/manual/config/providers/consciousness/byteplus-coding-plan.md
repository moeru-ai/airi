---
title: BytePlus Coding Plan
description: Configuring the BytePlus Coding Plan chat model in AIRI
---

BytePlus Coding Plan is available in AIRI as an independent provider card.

::: info Why choose BytePlus Coding Plan?
If your BytePlus account has a Coding Plan, you should use this card instead of the normal BytePlus configuration to match the corresponding service plan.
:::

## Step 1: Prepare BytePlus Coding Plan credentials

1. Open the [BytePlus Console](https://console.byteplus.com/) and obtain the Coding Plan API key.

::: warning API Key Security
Do not submit API keys or endpoint credentials to the repository, take screenshots, or send them to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Providers → Chat → BytePlus Coding Plan** and enter the API key.
2. Keep the default Base URL unless the Coding Plan documentation provides another compatible API root. Models come from AIRI's static provider list; this form has no endpoint or model field.

## Step 3: Verify configuration

1. **Validate**: Save the configuration and run the validation shown on the provider page. Then select the provider and model under **Settings → Modules → Consciousness** and send a test message.
2. **Select Model**: After successful testing, select an available model in **Settings → Modules → Consciousness**.

## Troubleshooting

When validation fails, check that the API key belongs to an active BytePlus Coding Plan and that the Base URL is correct. If a listed model is denied, confirm that the plan grants access to it.
