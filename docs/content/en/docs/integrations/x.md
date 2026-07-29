---
title: X / Twitter
description: Enable AIRI's X / Twitter integration with X Developer Platform credentials
---

The X / Twitter integration uses four credentials from an X Developer Platform application so AIRI's service channel can request X / Twitter features. Your X developer account issues these credentials. Available read, publish, and other capabilities depend on the application's permissions and X plan limits.

## Prerequisites

- An X developer account with access to the [X Developer Portal](https://developer.x.com/en/portal/dashboard).
- An X application with an API Key, API Secret, Access Token, and Access Token Secret.
- Application permissions for the operations you intend to use.

::: warning Credential security
The API Key, API Secret, Access Token, and Access Token Secret grant access to your application. Enter them only in AIRI's local settings. Do not commit them, include them in screenshots or issues, or send them to anyone. If you suspect exposure, regenerate the affected credentials immediately in the X Developer Portal.
:::

## Configure in AIRI

1. Open **Settings → Modules → X / Twitter**.
2. Enable **X / Twitter Integration**.
3. Enter the API Key, API Secret, Access Token, and Access Token Secret.
4. Click **Save**. The page shows **configured** when all four fields have values.

**Configured** means AIRI saved the credentials; it does not guarantee that every request will succeed. X determines the actual result from the application's permissions, account status, access plan, and rate limits.

## Troubleshooting

- Copy the four credentials again and check for extra spaces or swapped key and secret values.
- In the X Developer Portal, verify that the application permissions cover the requested operation.
- Check that the application, project, and developer account are active and that the current plan allows the API request.
- If a request is rejected or rate-limited, inspect the error returned by X and wait for the limit window to end. Do not try to bypass rate limits with repeated requests.
