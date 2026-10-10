# VRM companion integration

## Playback ownership

The main stage and model preview use one ownership runtime per loaded avatar.
All user commands, conversation cues, optional game gestures, and notification waves use this runtime.

Priority is:

1. Explicit emergency stop
2. Pointer manipulation and camera inspection
3. User-started games and motion commands
4. High-priority notification waves
5. Conversation cues and idle motion

An explicit user action can replace an active game. A new game can replace a user motion.
Every async load and release retains its operation identity. An old release cannot stop newer playback with the same animation ID.
Manual manipulation and model replacement revoke game reservations and pending loads.
The selected identity must match the scene's committed loaded identity before any producer can use its controller.
Framing revisions remain monotonic when an ownership instance changes around a cached scene root.
Conversation `stop` cancels only conversation playback. The motion panel's Stop command clears all producers and pending attention.

## Notifications

The desktop stage accepts only live high-priority wave intents from the main process.
It preserves the source event ID, coalescing key, and five-second expiry. Maximum-length event IDs remain valid without added prefixes.
The queue waits through user actions and games. It discards expired events rather than replaying inbox history.
DND, pause, reduced motion, disabled reactions, or model replacement cancel attention playback and pending events.
Native delivery and unread counts do not require avatar playback.
Marking a group read or clearing the inbox withdraws its unstarted attention. An active wave can finish smoothly.
A native toast timeout alone does not mark an item read or withdraw its attention.
No notification reaction focuses, raises, resizes, or moves a native window.

## Games

Settings includes a Games entry. Avatar gestures start disabled.
The optional transport reserves user-game priority across the whole active session, including gaps between gestures.
A one-second heartbeat renews the reservation. A missing renderer loses its reservation after four seconds.
Every later command carries the acknowledged loaded-instance ID. Reloading the same avatar cannot revive an old lease.

Wave, bow, celebration, and present gestures use existing clips.
Point and throw use Present. Think uses Nod. Catch uses Celebrate.
Rock, paper, and scissors remain text-only because the current library has no matching hand poses.
The games remain usable when avatar motion is unavailable or a higher-priority owner interrupts it.
No hand-drag IK is implemented.

## Camera fallback

Framing runs after animation, expressions, constraints, and spring bones update.
It samples visible rendered geometry with finite node, mesh, instance, and vertex budgets.
It excludes interaction-only colliders and preserves the current orbit target and camera orientation.
An idle close-up stays unchanged until a motion needs more room.
Automatic offsets never become saved camera preferences through programmatic OrbitControls updates.
Manual camera input owns the view immediately. A completed manual change establishes a new baseline.
The integration limits automatic zoom-out to 2.5 times the baseline anchor distance.

Active motion uses a conservative rest-envelope estimate and a throttled live geometry guard.
Imported clips do not yet have isolated preflight sampling. Extreme motion, large props, or sampling-budget exhaustion can still clip.
No complete visibility guarantee is made for imported motion or arbitrary avatars.
This is camera framing inside the existing canvas. It is not native Wayland window expansion.
The optional KWin bridge remains isolated and disabled by default.

## Click reactions

Click-only colliders map the head to Nod, hands to Wave, and feet to Bow.
Arm regions retain expression feedback. A drag never becomes a click reaction.
OrbitControls releases its pointer ownership before the queued click motion runs.
Reduced motion keeps expression feedback without starting a body gesture.

## Verification limits

Pure tests cover the ownership runtime, real Three.js camera math, geometry sampling, and strict transport schemas.
Browser tests cover the Eventa transport and the existing game lifecycle, but local Chromium cannot start because socket creation is denied.
The partial local dependency set cannot complete workspace Vue type checks or a full desktop build.
CI retains repository lint, workspace type checks, browser tests, and the Linux window smoke test.
A source checkpoint is not a verified package or release.
