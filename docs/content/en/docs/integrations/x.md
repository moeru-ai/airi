---
title: X / Twitter (unavailable)
description: Current implementation status of AIRI's X / Twitter integration
---

The X / Twitter integration is not functional in AIRI 0.11.3. Although **Settings → Modules → X / Twitter** displays credential fields and can show **configured**, the app cannot currently deliver that configuration to the separate X service.

::: warning Do not enter X credentials

Do not enter an API Key, API Secret, Access Token, or Access Token Secret in the current version. The **configured** state means only that all four fields contain values; it does not confirm a working service connection.
:::

## Current limitation

The AIRI module publishes configuration under the module name `twitter`, while the external service expects `x`. The channel protocols also disagree: the server forwards configuration as `module:configure` with a `{ config }` payload, but the service listens for `ui:configure` and expects a `moduleName` field. The external service also runs as a separate process and is not started by AIRI. Fixing only the module name or starting the service manually is therefore not enough to make the form work.

There is no supported end-user workaround. Contributors investigating the implementation can compare:

- `packages/stage-ui/src/stores/modules/twitter.ts`
- `services/twitter-services/src/adapters/airi-adapter.ts`

## Credential security

If you previously entered credentials, remove them from AIRI and rotate them in the [X Developer Portal](https://developer.x.com/en/portal/dashboard) if they may have been exposed. Never commit, screenshot, or share X credentials.
