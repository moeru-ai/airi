---
title: X / Twitter
description: Enable AIRI's X / Twitter integration using X Developer Platform credentials
---


The X / Twitter integration uses the four credentials of an X Developer Platform app so that AIRI's service channel can request X / Twitter features. The credentials are issued by your own X developer account; whether you can read, post, or use other capabilities depends on the permissions granted to the app and X's plan limits.


## Prerequisites


* An X developer account that can use the [X Developer Portal](https://developer.x.com/en/portal/dashboard).
* A created X app with an API Key, API Secret, Access Token, and Access Token Secret generated.
* The app has the API permissions you want to use.


::: warning Credential Security


The API Key, API Secret, Access Token, and Access Token Secret are equivalent to the app's access credentials. Only enter them in AIRI's local settings; do not commit them to the repository, put them in screenshots, paste them in issues, or share them with others. If you suspect a leak, regenerate the corresponding credentials immediately in the X Developer Portal.


:::


## Configure in AIRI


1. Open **Settings → Modules → X / Twitter**.
2. Enable the X / Twitter integration.
3. Fill in the API Key, API Secret, Access Token, and Access Token Secret respectively.
4. Click **Save**. When all four fields are non-empty, the page shows "Configured".


"Configured" means AIRI has saved the credentials; it does not guarantee every request will succeed. X determines the actual result based on app permissions, account status, access plan, and rate limits.


## Troubleshooting


* Re-copy the four credentials and confirm there are no stray spaces, and that the Key and Secret are not swapped.
* Check in the X Developer Portal whether the app's permissions cover the current operation.
* Check whether the app, project, and developer account are in a usable state, and whether the current plan allows the API request.
* If a request is rejected or rate-limited, look at the error message returned by X and wait for its limit window to end; do not bypass rate limits by repeating requests.

