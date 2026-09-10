# Devtools Sample Extension

This sample extension is for validating extension host behavior in the **Extension Host Inspector** page.

## Files

- `extension.airi.json`: extension manifest (`ExtensionManifestV2`)
- `devtools-sample-plugin.mjs`: self-contained bundled Extension output

The manifest declares the extension entrypoint used by the host inspector sample.

## How to use

1. Open `/devtools/plugin-host` in Stage Tamagotchi.
2. Click `Import Folder` and select this sample directory.
3. Review the package facts and click `Import Extension`.
4. Find `devtools-sample-plugin` and click `Enable and Load`.
5. Confirm:
   - the import starts in the disabled and unloaded state
   - extension appears as `loaded`
   - session phase becomes `ready`
   - capability list is visible

## What this extension does

- `setup`: logs startup in renderer/main console.

It does not mutate app state; it is safe for lifecycle verification.
