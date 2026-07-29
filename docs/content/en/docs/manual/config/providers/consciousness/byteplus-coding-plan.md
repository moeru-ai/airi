---
title: BytePlus Coding Plan
description: Configuring the BytePlus Coding Plan chat model in AIRI
---

BytePlus Coding Plan is available in AIRI as an independent provider card.

::: info Why choose BytePlus Coding Plan?
If your BytePlus account has a Coding Plan, you should use this card instead of the normal BytePlus configuration to match the corresponding service plan.
:::

## Prepare BytePlus Coding Plan credentials

1. Log in to the [BytePlus ModelArk console](https://console.byteplus.com/ark/region%3Aark%2Bap-southeast-1/application-center) and obtain the Coding Plan API key.

::: warning API Key Security
Do not commit API keys or endpoint credentials, include them in screenshots, or share them with anyone.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → BytePlus Coding Plan** and enter the API key.
2. Keep the default Base URL unless the Coding Plan documentation provides another compatible API root. Models come from AIRI's static provider list; this form has no endpoint or model field.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select an available model.

## Troubleshooting

When validation fails, check that the API key belongs to an active BytePlus Coding Plan and that the Base URL is correct. If a listed model is denied, confirm that the plan grants access to it.
