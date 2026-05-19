# Vendored Add-on Local Patches

This project vendors Godot add-ons under `addons/` because Godot plugins are
installed as project-local source and asset folders. Keep this file in sync
whenever vendored add-on files differ from their upstream source.

## Upstream Baselines

- `addons/vrm`
  - Repository: `https://github.com/V-Sekai/godot-vrm`
  - Branch: `only-addon`
  - Commit: `651205484c35f5cd7ba56475ff636e10db8ad674`
- `addons/Godot-MToon-Shader`
  - Repository: `https://github.com/V-Sekai/Godot-MToon-Shader`
  - Branch: `main`
  - Commit: `268c0d3b19c0885698b7bd39e21a16c9c2af448f`

## Source Patches

### `addons/vrm/vrm_extension.gd`

- Local change: use `root_node.get_node_or_null("secondary")` instead of
  `root_node.get_node("secondary")`.
- Reason: some VRM 0.0 exporters include `secondaryAnimation` data without a
  scene node named `secondary`. The upstream `get_node()` call throws before
  the existing null fallback can create the node.
- Validation: comparing vendored source files against upstream commit
  `651205484c35f5cd7ba56475ff636e10db8ad674` shows this as the only changed
  `.gd`/`.shader`/`.cfg`/`.cs` file under `addons/`. Runtime import then
  completes without the `Node not found: "secondary"` importer error.
- Removal condition: remove this patch after the upstream add-on ships the same
  lookup fix or otherwise handles missing `secondary` nodes before parsing
  spring bones.

## Generated Metadata Differences

These files differ from the upstream commit after opening/importing the add-on
with Godot `4.6.2`. They are not AIRI behavior patches, but they are recorded so
future add-on upgrades can distinguish generated metadata churn from intentional
source changes.

### SVG Import Metadata

- `addons/vrm/node_constraint/icons/bone_node_constraint.svg.import`
- `addons/vrm/node_constraint/icons/bone_node_constraint_applier.svg.import`

Observed difference:

- Godot `4.6.2` adds current texture import fields such as
  `compress/uastc_level`, `compress/rdo_quality_loss`, and
  `process/channel_remap/*`.

### Godot UID Sidecars

Godot generated `.uid` sidecar files under:

- `addons/vrm/**/*.uid`
- `addons/Godot-MToon-Shader/**/*.uid`

These preserve Godot resource UIDs for imported scripts and shader resources.
They are local generated metadata, not source patches.

## Upgrade Checklist

When updating the vendored add-ons:

1. Compare the new upstream add-on against the current vendored tree.
2. Re-apply source patches listed above only if the upstream fix is still absent.
3. Let Godot regenerate import metadata and `.uid` sidecars if needed.
4. Update this file with the new upstream commit and the remaining local patch
   list.
