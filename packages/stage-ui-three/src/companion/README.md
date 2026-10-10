# Companion framing and attention contracts

The policy helpers return bounded decisions. The scene adapter applies camera offsets. None of these modules open notifications or change native desktop surfaces.

## Motion framing

`motion-framing.ts` proposes a camera offset for a perspective scene.

1. Create one `MotionFramingController` for each loaded-model instance. Use an instance identity, not an asset filename.
2. Keep metadata, sampled envelopes, visible props, and live bounds in one stable model-local coordinate space.
3. Combine all visible meshes. Include hair, clothing, accessories, secondary motion, and the motion's allowed root movement.
4. Sample imported animations before playback. A body skeleton alone does not bound rendered geometry.
5. Pass a baseline model-to-camera transform, a stable anchor, and the baseline lens.
6. Increase `motionRevision` for each playback replacement, including repeated playback of one clip.
7. Increase `cameraRevision` after user camera, lens, viewport, or pivot changes.
8. Apply `cameraOffset` from the unchanged baseline, in its local axes. Never add it repeatedly to the current camera.
9. Keep the baseline orientation and inspection pivot. The helper changes neither.
10. During direct manipulation or camera inspection, pass `manualControl: true`.
11. After manual control ends, capture the user's camera as a new baseline and increase `cameraRevision`.
12. On model unload, call `reset()` and discard the controller.

Growth happens immediately. Shrinking requires valid live geometry and waits through the configured delay.
Old envelopes remain through crossfades. Set `transitionHoldMs` to at least the runtime's longest transition.
Rapid replacements merge old envelopes into bounded storage. Older motion revisions cannot replace newer bounds.
The helper ignores invalid boxes and rejects invalid transforms, lenses, and anchors.

The returned factor is an anchor-distance multiplier. Its default limit is four times the baseline distance.
A `limited` result means the pose can still clip. Select a compact motion or let the user adjust the view.
A missing proposal means the host keeps its existing framing. It is not permission to reset the user's camera.

This is the camera fallback when native window geometry is absent, denied, or unreliable.
There is no native Wayland resize claim. A separate surface manager owns any future window negotiation and anchor readback.
Rendering bounds, hit-test bounds, and native input regions remain separate.

## Integration and remaining verification

The main stage and model preview apply the camera adapter after VRM updates.
The shared motion host owns notification leases and all other playback producers.
The desktop stage forwards fresh priority intents without replaying its persisted inbox.
See [the integration contract](../../../../docs/ai/companion-integration.md).

The following acceptance work remains:

- Capture conservative imported-motion envelopes without changing the live avatar during sampling
- Replace heuristic active-motion headroom with sampled built-in envelopes where necessary
- Exercise long hair, wide skirts, off-center pivots, portrait viewports, crossfades, and repeated replacements in browser tests
- Verify that inspection controls remain stable and that transparent margins do not expand native input regions

The pure tests verify the math and state transitions. They do not prove that an animated avatar stays visible in the running app.

## Priority notification waves

`notification-wave-queue.ts` returns start and cancellation decisions. It never calls the motion controller or a native API.

1. Create one `NotificationWaveQueue` for each loaded-model instance.
2. Route only fresh high-priority wave intents from the main-stage notification channel.
3. Read `MotionController.snapshot` when enqueueing and before each `next()` call.
4. Track direct manipulation, active games, and user motion requests explicitly, including requests that are still loading.
5. Map those states to `manipulationActive`, `gameActive`, and `userMotionActive`.
6. Pass current pause, DND, reduced-motion, enablement, and wave-availability settings.
7. On a start decision, reserve the returned model and lease IDs before calling `controller.play()`.
8. Recheck ownership immediately before playback and after every asynchronous load.
9. On a cancellation decision, stop only the runtime operation that still owns that same lease.
10. On completion or load failure, call `finish(modelId, leaseId, now)`.
11. On model unload, dispose the queue, cancel its matching operation, and detach the notification listener.

Direct manipulation outranks games. Games and user-requested motion outrank notifications.
Loading, queued, and non-idle playback delay waves unless the host explicitly proves conversation ownership.
A conversation cue yields only after expiry, suppression, and cooldown checks authorize a notification start.
A user-requested wave and a notification wave share a motion ID. Snapshot IDs alone cannot distinguish their ownership.
All motion producers must participate in the same host ownership policy before this queue is connected.
A generic `controller.stop()` is unsafe after another owner has replaced a notification.

Read or removed inbox groups use `withdraw(coalesceKey)` to remove unstarted attention. This does not stop an active wave or clear replay protection.

Pending groups and replay protection are bounded. Coalescing cannot extend an old group's expiry.
Pause, DND, unavailable waves, disabled reactions, and model changes clear pending events.
The queue uses source timestamps, so supply the same clock domain as those timestamps.
The host must poll while an event is pending or a lease is active, including busy-to-idle transitions.

### Desktop intent mapping

The current desktop contract preserves the originating event identity in `requestId`.
Use `requestId` for both `eventId` and `intentId`. Use `notificationId` as `coalesceKey`.
Copy `createdAt` and `expiresAt` unchanged. Do not replay intents from the persisted inbox.
The existing main-process intent expires after five seconds. Waiting does not extend that lifetime.

The desktop stage now uses this queue through the shared motion host. The older standalone `DesktopReactionGate` is not the playback owner.
Keep the native toast and unread count independent from character playback.
Never focus, raise, show, resize, or move a window to play a notification wave.

## Verification

The tests use real Three.js projection matrices for framing assertions.
They cover scale, aspect ratio, off-center anchors, malformed geometry, manual-camera cancellation, crossfades, and bounded repeated playback.
Queue tests cover busy-to-idle delivery, replay protection, coalescing, expiry, priority, lifecycle cleanup, and stale completions.
Runtime integration and browser validation remain separate acceptance steps.

## Scene camera adapter

`SceneMotionFraming` applies the framing proposal to an actual `PerspectiveCamera`.
Create one adapter per loaded-model instance and tick it after animation, spring bones, and model transforms.
Pass the stable placement root above the movement group. Pass a stable world anchor, not a moving bone's current position.
Use the inspection pivot as the anchor while OrbitControls owns that target.

The adapter captures a baseline on each explicit camera revision.
If only its own offset moved the camera, viewport and lens revisions retain the un-offset position.
Manual control or an external pose change captures the user's new position instead.
Unexpected camera changes suspend automatic framing until another explicit revision.
The adapter never changes the camera quaternion, projection, zoom, or controls target.

Set `motionActive: true` during loading and non-idle playback.
Set `motionActive: false` during idle. This keeps initial close-ups unchanged and smoothly restores the saved view after playback.
Idle restoration uses `shrinkDelayMs` and `shrinkRate`. It stops immediately when manual control begins.
Leave `motionActive` undefined only for callers that intentionally want continuous full-body fitting.

Live sampling includes visible meshes, current skinning, current morph weights, and bounded instance transforms.
Invisible ancestors, invisible materials, transparent zero-opacity meshes, and interaction colliders are excluded.
The default cadence is 100 milliseconds. Rapid motion replacements cannot bypass that cadence.
Node, mesh, vertex-work, and instance limits keep each sample bounded.
Incomplete or malformed geometry produces `unavailable`. It never changes the camera using partial bounds.
Off-axis perspective projections are unsupported and leave the camera unchanged.

The first complete sample supplies a reference envelope. It is not a measured rest pose or a motion's swept envelope.
Active motion without real preflight bounds widens that reference heuristically and reports `limited: true`.
Supply `motionEnvelope` only for real metadata or sampled preflight bounds in the stable root's coordinates.
This adapter does not sample imported animation clips and cannot guarantee their complete visibility between live samples.

Call `reset({ restore: true })` to remove a still-owned automatic camera offset when disabling framing.
Restoration never undoes a manual camera change. Call `reset()` without restoration when the camera is being destroyed.
Native window geometry, input regions, and window focus remain outside this adapter.
