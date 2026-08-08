---
title: Volcengine Coding Plan
description: Configuring the Volcengine Coding Plan chat model in AIRI
---

The Volcengine Coding Plan is available as an independent provider card in AIRI.

::: info Why choose Volcengine Coding Plan?
If your account uses the Volcengine Coding Plan, select this card for the corresponding service plan.
:::

## Prepare Coding Plan credentials

1. Log in to the [Volcengine Ark Coding Plan console](https://console.volcengine.com/ark/region%3Acn-beijing/subscription/coding-plan) and obtain the Coding Plan API key.

::: warning API Key Security
Do not commit API keys or endpoint credentials, include them in screenshots, or share them with anyone.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Volcengine Coding Plan** and enter the API key.
2. Keep the default **Base URL** unless the Coding Plan documentation provides another compatible API root. Models come from AIRI's static provider list; this form has no Endpoint ID or model field.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select an available model.

## Troubleshooting

When validation fails, check that the API key belongs to an active Volcengine Coding Plan and that the Base URL is correct. If a listed model is denied, confirm that the plan grants access to it.
