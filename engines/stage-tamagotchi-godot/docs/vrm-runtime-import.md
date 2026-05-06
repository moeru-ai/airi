# VRM Runtime Import

The G1.1 Godot stage accepts VRM scene input only.

## Host Boundary

The Electron settings renderer keeps using the existing selected-model store.
When Godot stage mode is active, Electron main materializes the selected VRM
bytes under `userData/godot-stage/models/<modelId>/<fileName>` and sends the
native file path to the Godot sidecar over the local WebSocket bridge.

Godot does not own the materialized file lifecycle. It owns only runtime nodes
and resources created from the imported file.

## Runtime Import Path

Runtime import is routed through:

```text
scripts/vrm/VrmAvatarLoader.cs
  -> scripts/vrm/VrmRuntimeImporter.gd
    -> scripts/vrm/AiriVrmRuntimeExtension.gd
      -> addons/vrm/vrm_extension.gd
```

`VrmRuntimeImporter.gd` mirrors the V-Sekai editor importer where runtime import
needs the same behavior:

- Registers the GLTF document extension through Godot's static
  `GLTFDocument.register_gltf_document_extension(...)` API.
- Sets `GLTFState.HANDLE_BINARY_EMBED_AS_UNCOMPRESSED`.
- Uses `IMPORT_USE_NAMED_SKIN_BINDS := 16`, matching
  `EditorSceneFormatImporter.IMPORT_USE_NAMED_SKIN_BINDS` from
  `addons/vrm/import_vrm.gd`.

The named-skin-bind flag is required for the current VRM samples. Without it,
the model can import but the mesh and skeleton binding can be visibly distorted.

## AIRI Runtime Extension

`AiriVrmRuntimeExtension.gd` extends the vendored V-Sekai VRM 0.x extension.
It exists because Godot 4.6 reports an internal missing-key error when
`GLTFState.get_additional_data(&"vrm/already_processed")` reads an unset key.

The AIRI runtime importer seeds that key before import, and the AIRI extension
treats only `true` as already processed. This preserves the vendor preflight
behavior while avoiding the debugger error during sidecar runtime import.

## Node Lifecycle

`StageSceneController` applies a new avatar in this order:

1. Import the new VRM into a detached node.
2. Add the imported node under `AvatarRoot`.
3. Replace the current avatar reference.
4. Remove the previous avatar from `AvatarRoot`.
5. Queue the previous avatar for freeing.

If import fails, the previous avatar remains visible.
