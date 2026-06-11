# Devtools Sample Plugin

This sample extension is for validating extension host behavior in the **Extension Host Inspector** page.

## Files

- `extension.airi.json`: extension manifest (`ExtensionManifestV1`)
- `devtools-sample-plugin.mjs`: extension implementation

The manifest declares the protocol permissions required by `apis.providers.listProviders()`: invoke `capabilities:wait`, invoke `resources:providers:list-providers`, read the provider resource, and wait for the provider-list capability.

## How to use

1. Open `/devtools/plugin-host` in Stage Tamagotchi.
2. Note the `registry.root` path from the page.
3. Copy both files into that `registry.root` directory.
4. In Extension Host Inspector:
   - click `Refresh`
   - find `devtools-sample-plugin`
   - click `Enable`
   - click `Load` (or `Load Enabled`)
5. Confirm:
   - extension appears as `loaded`
   - session phase becomes `ready`
   - capability list is visible

## What this extension does

- `init`: logs startup in renderer/main console.
- `setupModules`: calls `apis.providers.listProviders()` and logs provider names.

It does not mutate app state; it is safe for lifecycle verification.
