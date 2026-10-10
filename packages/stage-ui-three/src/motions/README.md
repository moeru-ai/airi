# VRM motion runtime

This module provides a metadata catalog and an animation controller for one VRM avatar.
It includes original procedural motions without model files or third-party motion assets.

## Use

Use this runtime for body gestures, a selected idle, and short bounded locomotion.
Keep expression weights, lipsync, gaze, and spring bones in their existing VRM owners.

The host creates a dedicated movement group between its placement group and `vrm.scene`.
The controller captures that movement group's initial position and rotation.
Stage settings remain on the parent placement group.

```ts
import { MotionController } from '@proj-airi/stage-ui-three/motions'
import { Group } from 'three'

const movementRoot = new Group()
placementRoot.add(movementRoot)
movementRoot.add(vrm.scene)

const motions = new MotionController(vrm, originalIdleClip, movementRoot)
await motions.play('bow')
await motions.play('wave', { mode: 'queue' })

// Each frame, update the mixer before the VRM expression and physics owners.
motions.update(delta)
vrm.update(delta)
```

The supplied idle remains selected until `setIdle` succeeds.
`setIdle('default-idle')` restores the supplied idle.
`setIdle` accepts an idle entry or an imported clip without scene locomotion.
It preserves an active gesture and changes the idle that follows it.

## Catalog and loaders

`createMotionCatalog()` exposes metadata before any procedural code or animation asset loads.
The built-in IDs are `natural-idle`, `bow`, `dance`, `run-circle`, `wave`, `nod`, `shake-head`, `celebrate`, `stretch`, and `present`.

Register imported motions with `catalog.register(metadata, loader)`.
Each loader receives the target `VRMCore` and an `AbortSignal`.
It returns an `AnimationClip` with normalized humanoid tracks for that avatar.
The caller retains ownership of files, asset URLs, and file permissions.

The catalog does not retain avatar-specific clips.
The controller retains at most eight cached source clips and sixteen queued requests.
Temporary mask and playback clips share immutable tracks with those sources.
The controller retains at most eight retiring actions, then releases each temporary clip and its mixer bindings.
A catalog replacement invalidates the old entry on the next request.
An in-flight result with an outdated revision cannot start playback.

## Playback and cleanup

- `play` replaces playback by default. Queue mode preserves the current request and appends another action.
- Repeated actions stop after fifteen seconds by default. Explicit deadlines cannot exceed sixty seconds.
- `stop` cancels pending requests, clears the queue, and blends back to the selected idle.
- `reset` returns immediately to idle for an invisible, detached avatar.
- `dispose` cancels requests, releases mixer bindings, and restores the temporary movement transform.
- A canceled request resolves false even if its asset transport cannot abort.
- A failed load returns to idle and permits the next queued action to proceed.

Body transitions use a 0.3-second crossfade from each action's current effective weight.
Interrupted transitions preserve those weights and use matching fade deadlines.
A restart of a weighted motion uses a separate temporary instance, so the old pose remains available during the blend.
Circle motion starts with its tangent along the rest heading and returns smoothly to the captured transform.
Yaw stays within 180 degrees per second, with acceleration bounded at 540 degrees per second squared.
Stop and timeout preserve that bound while the controller brakes, reverses, and restores the exact rest orientation.
Its radius cannot exceed 20% of the estimated humanoid height.
Height and leg lengths come from the normalized rest pose, independent of current poses or stage scale.

## Track ownership

The controller accepts only normalized humanoid quaternion tracks and the hips position track.
It removes eye, jaw, expression, material, scale, and scene-transform tracks.
It anchors imported hips motion to the rest position and bounds horizontal and vertical displacement.
The source clip remains unchanged.

For a partial-body motion, a temporary idle companion contains only tracks absent from the motion.
The two track sets are disjoint. The selected idle cannot dilute the motion on its owned bones.
The companion retains the idle phase and normal playback rate, including during faster motion loops.
A changed idle replaces the companion without restarting the gesture.
A cached motion receives a fresh mask against the selected idle on each playback.

Procedural bow, dance, and idle motions use a two-link leg solution to preserve each ankle position.
The circle motion uses a gentle jog with alternating strides, knee flexion, foot movement, and arm swings.
Upper-leg swing stays within 0.28 radians. The hips bob stays within 0.3% of the estimated humanoid height.
These bounds limit motion displacement. Avatar proportions, clothing, and spring settings still require visual checks.
Optional bones are omitted when the avatar does not provide them.

## Checks

From the repository root:

```sh
pnpm -F @proj-airi/stage-ui-three exec vitest run src/motions/controller.test.ts
pnpm -F @proj-airi/stage-ui-three typecheck
pnpm lint
```

The tests use real normalized VRM rigs without a renderer or a model asset.
They cover lazy catalogs, resource limits, queue order, cancellation, root movement, track filtering, and planted feet at different scales.
