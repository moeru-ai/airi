---
title: AIRI official provider
description: Use AIRI's official chat provider
---

If you want to get started with AIRI quickly and want to simplify configuration, you can use the official provider to enable chat.

::: info Why choose AIRI official provider?
If you want to quickly experience AIRI without configuring a third-party API Key yourself, you can choose the official provider.
:::

## Log in to your account

1. Click the login button and a browser page will open.
2. Select a login method. We currently support email, Google and GitHub logins.

    ::: info Special reminder for Chinese users
    Users in China may not be able to log in with Google and GitHub. Please use your email to log in. Registering and logging in with a mobile phone number is not currently supported.
    :::

3. Follow the prompts to complete login/registration.

    ::: info
    If you don't receive the email, please check if it is in spam.
    :::

## Check available Flux

Flux is the balance used by AIRI official services. Any initial grant is configured by the current deployment, so check the balance shown in **Settings → Flux** rather than assuming a fixed amount.

## Enable the provider

1. Open **Settings → Modules → Consciousness**.
2. Select **Official Provider** and the **Auto** model.
3. Send a short message and confirm that AIRI replies.

AIRI selects the official provider automatically only when no chat provider is already active. If you previously selected another provider, signing in does not replace that selection.

## Charge Flux

Open **Settings → Flux** and choose an available package. On desktop, AIRI opens checkout in the system browser and refreshes the balance when the app regains focus. Builds or deployments with purchasing disabled do not offer checkout.

## Troubleshooting

If you do not receive the sign-in email, check your spam folder. If Flux packages are unavailable or checkout cannot be created, purchasing may be disabled for that deployment or temporarily unavailable.
