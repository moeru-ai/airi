- [日本語](README.ja.md)

# VRM addon for Godot Engine

This Godot addon fully implements an importer and exporter for models with the [VRM specification](https://github.com/vrm-c/vrm-specification/tree/master/specification).
Compatible with Godot Engine 4.0 stable or newer.

Proudly brought to you by the [V-Sekai team](https://v-sekai.org/about).

This package also includes a standalone full implementation of the MToon Shader for Godot Engine.

![Example of VRM Addon used to import two example characters](vrm_samples/screenshot/vrm_sample_screenshot.png)

## What is VRM?

See [https://vrm.dev/en/](https://vrm.dev/en/) (English) or [https://vrm.dev/](https://vrm.dev/) (日本語)

"VRM" is a file format for handling 3D humanoid avatar (3D model) data for VR applications.
It is based on [glTF 2.0](https://www.khronos.org/gltf/). Anyone is free to use it.

## VRM Features are currently supported in Godot Engine!

Import and export of VRM through version 1.0 is supported. Here is a feature breakdown:

* VRM 0.0 Import: ✅Implemented; will convert to VRM 1.0 compatible naming!
* VRM 1.0 Import: ✅Implemented
* VRM Export (`.vrm`): ✅Implemented, will export all models as VRM 1.0
* glTF Export with VRM 1.0 extensions (`.gltf`): ✅`VRMC_node_constraint`, ✅`VRMC_materials_mtoon`
	* ⚠️ `VRMC_springBone` not supported in non-`.vrm` standalone `.gltf` export.
	* ⚠️ Warning: When exporting `.gltf`, a clone of the scene root node is not made by Godot.
	  Because some export operations are destructive, the export process will corrupt some of your materials.
	  Please save the scene first and revert after export!

* `VRMC_materials_mtoon`: ✅Implemented
* `VRMC_node_constraint`: ⚠️Buggy: known issues when combined with retargeting.
* `VRMC_springBone`: ✅Implemented, but needs optimization.
* `VRMC_materials_hdr_emissive`: ✅Implemented
* `VRMC_vrm`: ✅Implemented
	* `firstPerson`: ⚠️Head hiding implemented and supported as an import option (camera layers or runtime script needed)
	* `eyeOffset`: ✅I️mplemented (`BoneAttachment3D` `"LookOffset"` on `Head`)
	* `lookAt`: ⚠Only creates animation tracks (application must create `BlendSpace2D`)
	* `expressions` (mood, viseme):
		* blend shapes / binds: ✅I️mplemented (Animation tracks intended for `BlendTree` `Add2`)
		* material color / UV offsets: ✅I️mplemented (Animation tracks intended for `BlendTree` `Add2`)
	* `humanoid`: ✅I️mplemented (uses `%GeneralSkeleton` `SkeletonProfileHumanoid` compatible retargeting.)
	* Metadata: ✅I️mplemented, including License information and screenshot

## Future work

* Support VRMC_vrm_animation:
	* Not yet implemented. Intended use: humanoid AnimationLibrary import/export.

## A note about SkeletonModifier3D on Godot 4.3 and later.

godot-vrm currently creates an internal node child of the Skeleton3D to facilitate processing the skeleton modifiers for
VRM spring bones and node constraints.

Due to the behavior of skeleton modifier, there may be some differences.
For example, on Godot 4.3+, `update_secondary_fixed` is no longer supported: instead, the Skeleton node determines whether to use physics or idle processing.

## Head hiding settings

At import time, there are new scene import settings for .vrm files.

For runtime usage, head hiding mode is determined by various additional data properties on the GLTFState object:
`vrm/head_hiding_method` is an enum `vrm_constants.HeadHidingSetting` that determines the mode.

For BothLayers and BothLayersWithShadow modes, the MeshInstance3D layers are determined by the
`vrm/first_person_layers` and `vrm/third_person_layers` integers respectively.

For FirstPersonOnlyWithShadow, FirstPersonOnly and ThirdPersonOnly, certain meshes are deleted or modified to make the character suitable for first person or third person usage.

Shadow modes will create an additional mesh for hidden heads set to ShadowsOnly to allow the hidden head to still cast a shadow.
Recommended if your game has a first person mode and uses lights with shadows enabled.

Finally, there is an IgnoreHeadHiding mode which disables handling of the firstPerson flags and acts like an ordinary glTF import.

## Note for users of Godot 3.x

For VRM compatible with Godot Engine 3.2.2 or later, use the `godot3` branch of this repository.

https://github.com/V-Sekai/godot-vrm

## How to use

Install the vrm addon folder into addons/vrm. MUST NOT BE RENAMED: This path will be referenced by generated VRM meta scripts.

Install Godot-MToon-Shader into addons/Godot-MToon-Shader. MUST NOT BE RENAMED: This path is referenced by generated materials.

Enable the VRM and MToon plugins in Project Settings -> Plugins -> VRM and Godot-MToon-Shader.

## Credits

Thanks to the [V-Sekai team](https://v-sekai.org/about) and contributors:

- https://github.com/aaronfranke and [The Mirror team](https://www.themirror.space/)
- https://github.com/fire
- https://github.com/TokageItLab
- https://github.com/lyuma
- https://github.com/SaracenOne

For their extensive help testing and contributing code to Godot-VRM.

Special thanks to the authors of UniVRM, MToon and other VRM tooling

- The VRM Consortium ( https://github.com/vrm-c )
- https://github.com/Santarh
- https://github.com/ousttrue
- https://github.com/saturday06
- https://github.com/FMS-Cat
