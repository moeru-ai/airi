# VRM Runtime Import

The G1.1 Godot stage accepts `.vrm` scene input only. The renderer and Electron
main gate the model format to `vrm`; they do not currently distinguish VRM 0.x
from VRM 1.0.

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

This is the current VRM 0.x runtime path. It exists because the vendored
`addons/vrm/import_vrm.gd` importer is an editor `EditorSceneFormatImporter`,
and the editor plugin is not active in the exported sidecar runtime.

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

## Version Boundary

There are two independent boundaries:

- VRM version: VRM 0.x files use the glTF extension key `VRM`; VRM 1.0 files use
  `VRMC_vrm` plus related `VRMC_*` extension keys.
- Runtime support: the V-Sekai add-on has editor import support, but it does not
  expose a stable high-level runtime API such as `load_vrm(path) -> Node`.

The current AIRI runtime bridge covers the VRM 0.x path:

```text
extensions.VRM
  -> scripts/vrm/AiriVrmRuntimeExtension.gd
    -> addons/vrm/vrm_extension.gd
```

It does not yet register the vendored VRM 1.0 runtime extension set:

```text
extensions.VRMC_vrm
  -> addons/vrm/1.0/VRMC_vrm.gd
  -> addons/vrm/1.0/VRMC_springBone.gd
  -> addons/vrm/1.0/VRMC_materials_mtoon.gd
  -> addons/vrm/1.0/VRMC_node_constraint.gd
  -> addons/vrm/1.0/VRMC_materials_hdr_emissiveMultiplier.gd
```

Do not treat `format: "vrm"` as a claim that all VRM versions are fully covered
by the sidecar runtime importer. VRM 1.0 runtime import needs a real fixture and
separate registration of the vendored `VRMC_*` extensions before it should be
claimed as supported.

## AIRI Runtime Extension

`AiriVrmRuntimeExtension.gd` extends the vendored V-Sekai VRM 0.x extension.
It exists because Godot 4.6 reports an internal missing-key error when
`GLTFState.get_additional_data(&"vrm/already_processed")` reads an unset key.

The AIRI runtime importer seeds that key before import, and the AIRI extension
treats only `true` as already processed. This preserves the vendor preflight
behavior while avoiding the debugger error during sidecar runtime import.

This key is also why VRM 1.0 cannot be enabled by only registering
`addons/vrm/1.0/VRMC_vrm.gd` in the current importer. `VRMC_vrm.gd` skips import
when `vrm/already_processed` is already set, while the VRM 0.x workaround seeds
that key before `append_from_file(...)`.

## Node Lifecycle

`StageSceneController` applies a new avatar in this order:

1. Import the new VRM into a detached node.
2. Add the imported node under `AvatarRoot`.
3. Replace the current avatar reference.
4. Remove the previous avatar from `AvatarRoot`.
5. Queue the previous avatar for freeing.

If import fails, the previous avatar remains visible.
