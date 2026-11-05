# @proj-airi/alice-avatar-tools

Converts the Ready Player Me avatar of the Alice persona (Eva) to VRM 1.0, so the AIRI VRM motion layer can drive her. This is sprint V4 of Plan 04 (`docs/alice-motion-engine/PLANEJAMENTO_04_REVISAO_UTSUWA_AIRI_AVATAR3D.md`).

The converter has no dependencies on the network. The input and the output stay on the machine.

## What it does

| Step | Result |
| --- | --- |
| T pose | The arms of a Ready Player Me avatar rest in an A pose, about 55 degrees down. VRM 1.0 and VRMA animations expect a T pose. The converter turns the arm bones to the horizontal, then re-skins the mesh, the blend shape deltas, and the inverse bind matrices, so the rest mesh matches the new skeleton. |
| Humanoid | Maps the Mixamo style bones (`Hips`, `Spine1`, `LeftForeArm`, `LeftHandIndex1`, and others) to the VRM humanoid bones, fingers included. |
| Expressions | VRM presets from the ARKit and viseme blend shapes: `aa`, `ih`, `ou`, `ee`, `oh`, `blink`, `happy`, `angry`, `sad`, `relaxed`, `surprised`, and the look directions. Every blend shape is also a custom expression, so the 52 ARKit names stay reachable. |
| Look-at | Eye bones, with the eye height from the skeleton. |
| Meta | Name, authors, and the VRM 1.0 license with no redistribution, no modification, and personal non-profit use. |

Textures, materials, and blend shapes do not change.

## How to use it

```sh
pnpm -F @proj-airi/alice-avatar-tools convert <input.glb> <output.vrm> [name] [author]
```

Example with the Eva avatar of the TalkingHead server:

```sh
pnpm -F @proj-airi/alice-avatar-tools convert <TalkingHead server folder>/avatars/eva2.glb ./eva2.vrm Eva Alice
```

The command prints a report, for example `armDropBeforeDegrees: 54.7` and `armDropAfterDegrees: 0`. Then import the `.vrm` file in AIRI: **Settings > Models > Select model > Import > VRM**.

## When to use it

- For an avatar from Ready Player Me, or another GLB with the same skeleton names and ARKit blend shapes.

## When not to use it

- For a model that is a VRM already. The converter refuses it.
- For a skeleton with other bone names. The converter names the first missing bone.
- Do not commit a converted avatar to a public repository. The source avatar has its own terms (Ready Player Me), and the VRM meta forbids redistribution.

## Test it

```sh
pnpm -F @proj-airi/alice-avatar-tools exec vitest run
pnpm -F @proj-airi/alice-avatar-tools typecheck
```

The tests build a small skinned avatar in an A pose and check the T pose, the re-skinned vertices, the blend shape deltas, the inverse bind matrices, and the extension.
