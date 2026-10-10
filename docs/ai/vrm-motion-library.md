# VRM motion library

## Boundaries

The shared runtime lives in `@proj-airi/stage-ui-three/motions`.
It owns catalog lookup, lazy clip loading, a per-avatar cache, playback, crossfades, and bounded movement.
The stage remains responsible for expressions, speech, gaze, humanoid updates, constraints, and spring bones.

The application layer lives in `packages/stage-ui/src/features/motions/vrm`.
It owns local imports, IndexedDB records, per-avatar settings, Eventa controls, and model prompts.
No avatar-specific name, author match, or private model asset selects behavior.

The original idle remains active until the user selects another idle.
Idle choices use the stable display-model ID rather than a temporary object URL.

## Use the library

1. Load a VRM model.
2. Open Settings > Models > Motion Library.
3. Select a motion and press Play, or add it to the queue.
4. Press Stop and return to idle to clear pending and active actions.
5. Select an idle motion to save it for this avatar.

Import accepts binary, self-contained `.vrma` files up to 16 MB and ten minutes.
External buffers, images, textures, and model meshes are rejected before parsing.
Imported assets stay in this application's local IndexedDB storage.
Import only files whose license permits your intended use.

The catalog stores metadata separately from binary assets.
Browsing does not parse every clip. Playback loads one selected clip and retargets it to the current avatar.
Each controller retains at most eight clips and sixteen queued actions.
Looping actions have a finite deadline. Idle playback alone repeats without a deadline.

Catalog entries expose stable IDs, names, categories, duration, loop intent, source, description, and tags.
Programmatic consumers can register a lazy loader with `MotionCatalog.register`.
See `packages/stage-ui-three/src/motions/README.md` for the API contract.

## AI and bridge controls

The existing streaming ACT channel accepts a registered motion ID:

```text
<|ACT {"motion":"bow"}|>
<|ACT {"motion":"dance","emotion":"happy"}|>
<|ACT {"motion":"stop"}|>
```

Each avatar has a separate AI enable switch and a list of up to 32 eligible motions.
The model prompt contains only that selection. It never contains animation bytes or local file URLs.
An unknown ID cannot register a new clip, fetch a URL, or execute code.
The application's Eventa motion bus supports manual play, queue, stop, and result events.
Commands include the target model ID and request ID.

## Ownership and cancellation

The motion controller runs before AIRI's existing humanoid, gaze, expression, and physics updates.
Imported tracks can affect normalized body rotations and bounded hips translation only.
Eye, jaw, expression, material, scale, and arbitrary scene tracks are excluded.

Circular running uses a dedicated movement group below the saved placement group.
It does not rewrite the user's model offset or camera settings.
Visible cancellation blends back to idle and the original scene position.
Model disposal and invisible cache detach cancel pending loads and immediately restore the movement group.
An aborted or replaced loader cannot bind its result to another avatar.

## Orbit inspection

Middle-click a visible model surface to move the orbit center to the clicked world-space point.
Middle-drag retains zoom behavior. A drag that returns to its starting point still counts as a drag.
Background clicks, hidden colliders, and UI controls do not change the pivot.

Camera and target translate together over 200 ms, preserving angle and distance.
Reduced-motion settings remove that transition. New pointer or wheel input cancels it.
The on-stage reset control returns to the model center. Model changes clear the custom pivot.
Animated skinned meshes refresh their bounds before picking.

## Original motion assets

The procedural motions and relaxed idle were authored for this change and use the repository's MIT license.
They contain humanoid animation data only. No custom avatar, private artwork, or external motion pack is bundled.
The relaxed idle was reduced to keyframes with a bounded error and lasts 48 seconds.
Procedural motion prioritizes readable gestures and bounded movement over motion-capture realism.
Clothing, hair, and platform shoes require visual review on each avatar.

## Fork release workflow

`VRM Motion Linux Candidate` is restricted to `le-firehawk/airi`.
Pushing `le-firehawk/feat/vrm-motion-library` runs checks and builds an artifact without publishing.

**Pushing a branch named `le-firehawk/release/vrm-motion-vVERSION` is an intentional publication request.**
Do not use that branch prefix for ordinary development.
VERSION must be a valid semantic version with an alpha, beta, nightly, or canary prerelease lane.
For example, `le-firehawk/release/vrm-motion-v0.12.0-beta.6.motion.1` publishes `v0.12.0-beta.6.motion.1`.
Feature artifacts use `0.12.0-beta.6.motion.0.dev.RUN`, which sorts below the first numbered motion release.

The workflow installs the lockfile, builds shared packages, and runs lint, typechecks, runtime tests, and import tests.
Browser checks cover the motion library, game sessions, game controls, and the desktop browser suite.
It builds the Linux sidecar, desktop application, and one amd64 DEB.
Only the publish job gets `contents: write`. Build jobs cannot publish.
The build verifies the update manifest version, asset name, size, SHA-512, and embedded fork routing.
The publisher checks the source SHA and package hashes before creating a prerelease for that exact commit.
It never overwrites an existing release and never publishes to the upstream repository, itch.io, or other registries.
The temporary Actions token creates no new persistent credential.

The Linux window smoke disables the Chromium sandbox only for its hosted-runner process. Packaged application settings stay unchanged.
Linux packaging needs no Apple signing credentials or third-party publishing service.
The upstream multi-platform release workflow remains unchanged.

Imports support linear keyframes. Step and cubic spline tracks are rejected before saving because the VRMA retargeter rebuilds quaternion tracks with linear interpolation. File size and decoded per-channel complexity limits apply before the loader runs.

Fork builds set `AIRI_RELEASE_REPOSITORY=owner/repository` at build time. The main bundle uses that repository for API lookup, Atom fallback, and download URLs. Unset values preserve `moeru-ai/airi`; invalid values fail the build. The release workflow keeps the architecture-specific `latest-x64-linux.yml` feed alongside the DEB. Automatic downloading stays disabled.
