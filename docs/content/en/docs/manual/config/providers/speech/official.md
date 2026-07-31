---
title: Official Speech Provider (TTS)
description: Use officially provided speech synthesis in AIRI
---

Official speech synthesis will use your AIRI login status, and there is no need to fill in a third-party API Key separately.

::: info Why choose AIRI official speech synthesis?
If you already use an official AIRI provider and want to reduce third-party credential configuration, try this option first.
:::

## Log in to your account

1. Use an AIRI account to complete the login; the official voice service depends on the current login status.
2. There is no need to create or fill in a third-party API Key.

::: warning Account and service availability
Available models, quotas, and regions are determined by the official service. Do not share account sessions or browser session data.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → Official Speech Provider**.
2. If prompted, sign in. Confirm that the page shows your Flux balance and a valid connection status.

## Verify configuration

1. Open **Settings → Modules → Speech**, select **Official Speech Provider**, and choose an available model and voice.
2. Enter a short test sentence, click **Test Voice**, and confirm that AIRI plays the generated audio.

## Optional streaming provider

When the official service reports streaming TTS as available, AIRI shows a separate **Official Streaming Speech Provider** card under **Settings → Providers → Speech**.

In **Settings → Modules → Speech**, keep **Official Speech Provider** selected. AIRI includes the streaming models in that provider's model list. Select a streaming model and voice; AIRI then switches the internal speech provider automatically to match the selected model.

## Troubleshooting

If the provider is unavailable, confirm that you are signed in, AIRI can reach the official service, and your account has enough Flux. Open **Settings → Flux** to view available packages. AIRI Desktop opens checkout in the system browser; builds or deployments with purchasing disabled do not show a purchase option.
