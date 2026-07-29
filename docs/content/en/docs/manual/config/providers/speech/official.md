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
2. Enter a short test sentence and confirm that AIRI plays the generated audio. If the service does not offer a streaming voice, no streaming option appears.

## Troubleshooting

If the provider is unavailable, confirm that you are signed in, AIRI can reach the official service, and your account has enough Flux. Open **Settings → Flux** to view available packages. AIRI Desktop opens checkout in the system browser; builds or deployments with purchasing disabled do not show a purchase option.
