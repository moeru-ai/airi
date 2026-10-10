# Local companion games

## Scope

The shared play room adds six small games at `/settings/games`.
The route runs in AIRI-owned UI and needs no desktop bridge.
This follow-up module does not change motion, desktop, or notification services.

The first pack contains:

- Paper toss: three throws with a deterministic arc, drag aiming, and numeric angle and strength controls.
- Catch the stars: twelve falling stars, a movable tray, slower play, and larger targets.
- Rock paper scissors: first to two wins, with nine total rounds as a tie limit.
- Copy the gesture: sequences of three, four, and five poses, with unlimited replay and untimed answers.
- Find the hidden star: three rounds of three cup swaps, with stable cup identity and a readable swap list.
- Follow me: six ordered targets, untimed movement buttons, focused arrow keys, and optional pointer control.

Scores stay in memory. Leaving the route clears the session.
The seed control repeats a session without recording pointer paths or personal information.

## Files and integration

- `packages/stage-ui/src/features/companion-games/host.ts` owns rules, scores, hidden choices, and session state.
- `use-game-session.ts` owns the renderer clock and interruption handling.
- `motion-adapter.ts` owns optional gesture leases.
- `packages/stage-ui/src/components/scenarios/companion-games/play-room.vue` owns the playfield and accessible controls.
- `packages/stage-pages/src/pages/settings/games.vue` binds model identity to session cleanup.
- `packages/i18n/src/locales/en/companion-games.yaml` supplies English labels through `companionGames`.

Import the component through the existing public export pattern:

```ts
import { CompanionPlayRoom } from '@proj-airi/stage-ui/components/scenarios/companion-games'
```

The component accepts `modelId`, `suspended`, and an optional `motionPort`.
Changing models stops the game. A true `suspended` value pauses the game and disables start and resume.
Replacing the motion port disposes the old adapter and pauses active play.

The route appears in both settings menus through its `settingsEntry` metadata.
Avatar gestures are off by default. The opt-in toggle binds the VRM game port from `features/motions/vrm/game-port`.
The play room still shows readable symbolic poses and local props when avatar gestures are off or unavailable.
The motion integration must implement the lease contract below.

## Deterministic state and cleanup

The host has five lifecycle operations: start, pause, resume, stop, and dispose.
Start replaces the current session. Stop removes all props and hidden choices.
Dispose rejects later starts.

The host owns no timers. The renderer supplies elapsed milliseconds with a captured session token.
A fixed 20 ms simulation step makes results independent of frame partitioning.
Deltas over 250 ms are discarded instead of replaying a background backlog.
Pause, resume, replay, restart, and stop invalidate earlier tokens and partial time.

The renderer runs its frame clock only during active timelines.
Choice screens, gesture answers, completed rounds, and follow-me practice need no background frame loop.
Pause and unmount cancel the clock and gesture lease.
Focus loss and hidden documents pause. Resizing pauses while retaining normalized game coordinates.
An empty playfield cannot start or resume active play.

Snapshots are detached from live state. The opponent hand is absent until reveal.
The random hand is committed before the user selects a sign.
Cup identities follow swaps. The hidden star stays attached to its logical cup.

One session has at most twelve stars, nine hand rounds, five sequence entries, or six path targets.
There are no leaderboards, uploads, persistent scores, global input listeners, pointer capture, or OS input injection.

## Motion ownership

`MotionPort.acquire(intent, signal)` returns a distinct `MotionLease` or refuses ownership.
The ownership order is emergency stop, direct manipulation, user game or action, priority notification gesture, then conversation and ambient motion.
The port must refuse during emergency stop, direct manipulation, or an unavailable model.
If a higher-priority behavior takes ownership, the port aborts the lease signal.

`MotionPort.sessionChanged(sessionId)` reserves game priority for the whole active session, including gaps between gesture leases.
A null session releases that reservation on pause, stop, model change, or unmount.
Notification gestures wait for this release. Native notification delivery continues normally.
The callback must change only this port's reservation.

A lease exposes `play(intent, signal)` and `release()`.
Playback must honor both the acquisition signal and the lease signal before every model update.
Release stops only that lease. It must never clear another behavior's motion.

The adapter has one active external operation and one latest pending intent.
New intents cancel older work. Duplicate and stale session/revision pairs are ignored.
Each lease has a five-second deadline. Exceptions stop optional motion without stopping the game.
An unresponsive operation blocks further gestures instead of accumulating unresolved work.

Supported names are wave, point, bow, celebrate, think, rock, paper, scissors, throw, and catch.
Names describe intent. They do not assume a particular rig or licensed motion asset.

## Accessibility

Every game has visible start, pause, resume, restart, and stop controls.
Focused arrow keys and large movement buttons replace pointer movement.
The game reads pointer input only inside its playfield. It never captures or repositions the pointer.

Follow-me starts in button/keyboard mode. Pointer control is an explicit option.
Mouse exit pauses pointer-controlled play. Ending a touch contact does not count as leaving an active pointer outside the field.

Reduced motion disables continuous timelines and CSS transitions.
The user advances time with one step button. Choices and memory responses have no timer.
The system reduced-motion preference takes priority over the local option.
Cup swaps also appear as text. Results never depend on color alone.

## Verification

The host and motion adapter have deterministic Vitest coverage for all game rules and lifecycle boundaries.
Tests cover frame partitioning, hidden choices, scoring, resize, outside input, rapid restarts, stale tokens, and gesture cancellation.

The browser suite mounts the real play-room component.
It covers all six control sets, reduced-motion stepping, pause/resume, touch exit, model changes, ownership interruption, focus, and resize.
A second browser suite checks real frame clocks, session reservations, motion-port replacement, and unmount cleanup.
Run the standard owning projects in a complete workspace:

```sh
pnpm -F @proj-airi/stage-ui exec vitest run --project node src/features/companion-games
pnpm -F @proj-airi/stage-ui exec vitest run --project browser src/components/scenarios/companion-games/play-room.browser.test.ts src/features/companion-games/use-game-session.browser.test.ts
pnpm -F @proj-airi/stage-ui typecheck
pnpm -F @proj-airi/stage-pages typecheck
pnpm -F @proj-airi/i18n typecheck
pnpm typecheck
pnpm lint
```

Local review ran the host and adapter tests through installed Vitest with an isolated configuration.
The full workspace lacks dependencies, including the Vue Vite plugin, Reka UI, and Vaul Vue.
The normal pnpm command also attempts dependency installation and fails at the unavailable pnpm home directory.
Browser execution is unverified because the environment denies the required socket creation.
No browser launch was retried. Component compilation and source review do not establish visual or browser acceptance.

## Remaining work

This foundation is separate from the first motion and desktop release.
Before enabling it for users, run the browser suite, inspect real renders, and check pointer and keyboard feel.
Verify the settings entry and opt-in model ownership port in both web and desktop builds.

Later polish can add endless paper practice, reverse-role follow-me, favorites, and validated local score persistence.
These options are absent from this first pack. No private character assets are included.
