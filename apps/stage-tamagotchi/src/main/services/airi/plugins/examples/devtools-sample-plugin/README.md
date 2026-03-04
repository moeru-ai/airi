# Devtools Sample Plugin

This sample plugin is for validating plugin host behavior in the **Plugin Host Inspector** page.

## Files

- `devtools-sample-plugin.json`: plugin manifest (`ManifestV1`)
- `devtools-sample-plugin.mjs`: plugin implementation

## How to use

1. Open `/devtools/plugin-host` in Stage Tamagotchi.
2. Note the `registry.root` path from the page.
3. Copy both files into that `registry.root` directory.
4. In Plugin Host Inspector:
   - click `Refresh`
   - find `devtools-sample-plugin`
   - click `Enable`
   - click `Load` (or `Load Enabled`)
5. Confirm:
   - plugin appears as `loaded`
   - session phase becomes `ready`
   - capability list is visible

## What this plugin does

- `init`: logs startup in renderer/main console.
- `setupModules`: calls `apis.providers.listProviders()` and logs provider names.

It does not mutate app state; it is safe for lifecycle verification.
