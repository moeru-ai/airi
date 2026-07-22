---
title: BytePlus Coding Plan
description: Configuring the BytePlus Coding Plan chat model in AIRI
---

BytePlus Coding Plan is available in AIRI as an independent provider card.

::: info Why choose BytePlus Coding Plan?
If your BytePlus account has a Coding Plan, you should use this card instead of the normal BytePlus configuration to match the corresponding service plan.
:::

## Step 1: Prepare BytePlus Coding Plan credentials

1. Open and log in to the [BytePlus Console](https://console.byteplus.com/)，在 Coding Plan corresponding page to obtain credentials and endpoint information.

::: warning API Key Security
Do not submit API keys or endpoint credentials to the repository, take screenshots, or send them to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → BytePlus Coding Plan**, and click the BytePlus console to fill in the credentials and endpoint information of the plan.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network and credentials are correct.
2. **Select Model**: After successful testing, select an available model in **Settings → Consciousness**.

## Troubleshooting

When validation fails, check whether the credentials and endpoint belong to the same BytePlus Coding Plan. When the model cannot be loaded, confirm that the plan has granted access to the target model.
