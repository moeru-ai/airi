# Optional native KWin bridge design

Status: native helper source compiles. Script transport and compositor mocks pass tests.
Private-bus behavior, native enrollment, and desktop behavior remain unverified.

## Verified API basis

The official [KWin scripting API](https://develop.kde.org/docs/plasma/kwin/api/) describes the KWin 6.0 boundary.
It documents cursor position and change signals, output bounds and scale, window identity, and writable frame geometry.
It also documents asynchronous `callDBus` and output-aware `clientArea` queries.
Use `KWin.WorkArea`, the selected output, and the current virtual desktop for placement limits.
Do not hard-code enum values.

KWin's [6.0 script implementation](https://github.com/KDE/kwin/blob/Plasma/6.0/src/scripting/scripting.cpp) exposes `QTimer` to scripts.
A failed D-Bus call does not invoke its success callback.
Therefore, a callback chain alone cannot implement failure detection or cleanup.
An independent timer must enforce the connection lease.

The current [Wayland window implementation](https://github.com/KDE/kwin/blob/master/src/waylandwindow.cpp) stores the Wayland client process ID.
The [client connection implementation](https://github.com/KDE/kwin/blob/master/src/wayland/clientconnection.cpp) obtains client credentials from Wayland.
These source observations inform enrollment. They do not prove Electron's process mapping on a target release.

## Transport choice

| Candidate | Benefit | Cost and limitation | Decision |
| --- | --- | --- | --- |
| Qt6 Core and DBus helper | Fits the KDE platform and provides bus caller metadata | Adds native build and packaging work | Implemented as a default-off native target |
| Node D-Bus library | Keeps the host implementation in TypeScript | Adds a runtime dependency and still needs caller verification | Defer |
| Spawn command-line tools per sample | Easy initial experiment | Process overhead, weak lifecycle control, and command output parsing | Reject |
| Loopback HTTP or WebSocket | Familiar application APIs | Adds a listening service and an authentication surface | Reject |

The helper is designed to run only while the user enables native companion integration.
No application launch path currently starts it.
AIRI main spawns it with private inherited pipes. It opens no TCP socket and accepts no public movement method.
Use the existing Eventa contracts for the application boundary. A transport adapter maps those contracts to the native boundary.

KWin scripts can call D-Bus methods. The documented scripting API does not provide a general exported method registration API.
Use a bounded exchange initiated by the script. Its reply can contain at most one pending geometry command.
The helper keeps at most one exchange and one geometry request active for each surface.
Cap frames at 8 KiB before UTF-8 decoding. Reject unknown fields and protocol versions.

A future script entry point performs this sequence:

1. Receive a session bootstrap from the explicitly enabled main-process setup path.
2. Call the helper's pinned unique D-Bus owner, path, interface, and exchange method.
3. Report the current layout and enrolled surface identity.
4. Start a 50 ms timer only after authentication and enrollment succeed.
5. Exchange the newest sample, pending acknowledgement, and one bounded command.
6. Stop on disable, lost ownership, process exit, expired lease, or any validation failure.

Do not use a public well-known helper name as the sole destination identity.
Do not log coordinates, frame payloads, or process identity data by default.

## Trust and enrollment

The helper receives the sender from the incoming [QDBusMessage](https://doc.qt.io/qt-6/qdbusmessage.html) in its virtual object handler.
The [QDBusVirtualObject API](https://doc.qt.io/qt-6/qdbusvirtualobject.html) exposes only the bounded Exchange method.
It resolves the current KWin owner through [QDBusConnectionInterface](https://doc.qt.io/qt-6/qdbusconnectioninterface.html).
Check the unique owner, UID, and PID. Never accept these fields from JSON.
Watch ownership changes and revoke the session before processing another message.

The script calls the helper's pinned unique bus owner. A replacement process cannot inherit that identity.
The helper accepts application commands only from its inherited parent pipe.
Pipe EOF revokes the session. No renderer or other D-Bus caller can enroll a window.

KWin scripts share the compositor's process and bus identity.
This design does not isolate AIRI from another malicious script already running inside KWin.
The compositor and its installed scripts remain trusted.
It also does not protect against a compromised account that can inspect or modify AIRI's process.

Enrollment must bind all of these fields:

- An AIRI-owned surface handle from the main-process window registry
- The exact KWin window object and its `internalId`
- The verified process that owns its native Wayland connection
- A process birth identity, such as boot identity plus process start time
- An expected application class as an additional check
- A fresh session ID and layout revision

Do not select by title, application class, or PID alone.
Do not assume that the Wayland connection PID equals Electron main or a renderer PID.
Establish that mapping on the packaged application before permitting geometry changes.
Reject ambiguous matches and native-versus-XWayland uncertainty.
A recreated window requires new enrollment, even when its PID and class remain unchanged.
Process exit or PID reuse permanently revokes the previous binding.

The TypeScript prototype receives trusted enrollment and peer metadata through its constructor and method boundary.
The C++ helper resolves actual bus credentials and process birth identities. Its socket-based integration tests remain unexecuted.
The main-registry gate returns unavailable when a native mapping verifier is absent. No production verifier exists yet.

## Coordinate and timing contract

KWin points and rectangles use `kwin-logical-desktop` coordinates.
Each output includes bounds, work area, and scale metadata.
Bounds already represent the output's desktop orientation. Do not invent a rotation property absent from the verified API.
The union of output rectangles is not a solid rectangle. Gaps remain outside every output.

The projector subtracts verified KWin content bounds, then divides by renderer zoom exactly once.
It does not multiply global coordinates by output scale or `devicePixelRatio`.
Frame bounds and content bounds differ when decorations exist.
A native adapter must verify the content bounds before projection.
Electron `getContentBounds()` on native Wayland is not a substitute for that verification.

Samples include session, sequence, wall-clock timestamp, layout revision, and source.
The receiver rejects old sessions, duplicate sequences, changed layouts, future timestamps, and samples older than 250 ms.
`projectPointer` checks freshness and geometry. The native helper retains the last accepted sample sequence.
The sender refreshes stationary samples at most 20 times per second.
No active session means no global sampling.

The prototype requires nondecreasing time and a 1000 ms verified parent lease.
A backwards clock or late heartbeat terminates the session.
Production uses a local monotonic timer for leases and a measured clock relationship for remote timestamps.
Suspend and resume require a fresh handshake. Do not revive an expired lease.

## Geometry and cleanup

Commands name only the enrolled surface handle.
The binding maps it to one retained KWin window object. Commands cannot supply a compositor window ID.
Each command includes a sequence, request ID, session ID, and layout revision.
A request expires after 250 ms and cannot replace an in-flight request.

The prototype limits movement to 32 logical pixels per accepted request.
Requests are spaced by at least 50 ms. This bounds sustained requested movement to 640 logical pixels per second.
Each dimension can change by at most 256 logical pixels per request.
Current and requested bounds must fit completely inside the same output work area.
The adapter reads the current KWin work area before every write and stops if it changed.
User move and resize operations take precedence.

The adapter writes only `frameGeometry` on its retained enrolled object.
It does not activate, raise, close, minimize, or alter another window.
An acknowledgement requires observed bounds within 0.5 logical pixels of the request.
After 300 ms without matching readback, return actual geometry and terminate control.
Do not retry geometry blindly or silently call a denied request successful.

Disable immediately disconnects owned signals, clears pointer state, and cancels pending acknowledgements.
The helper rejects new commands and closes its parent path.
The future setup owner must stop the timer and unload the session's script.
Without that host wiring, remote script sampling stops on its next terminal reply or within the 1000 ms lease.
Immediate cross-process sampling shutdown is therefore still a live integration gate.
An already-issued compositor configure can finish after disable. The prototype cannot cancel an external operation already submitted.
No further geometry writes occur during cleanup.

Output changes stop the prototype instead of moving a window through an unknown layout.
KWin's normal placement and AIRI's ordinary controls remain the recovery paths.
A tested reset-to-visible-work-area action is a separate live integration requirement.
No hotplug recovery or tray accessibility guarantee is claimed here.

## Foundation integration contract

Keep this module unimported until the native release gates pass.
The current desktop foundation uses Electron-specific `screenDip`, `displayId`, and `localCss` samples.
Do not cast KWin output names into Electron display IDs or relabel KWin positions as Electron DIP.
A future main-process adapter provides a separately tagged pointer source and owns coordinate conversion.
Bind external runtime dependencies through the existing main-process dependency injection system.

The native adapter must expose independent runtime capabilities for pointer sampling, geometry requests, and geometry readback.
A KDE session name or successful helper launch does not prove those capabilities.
Emit unavailable state and neutral gaze immediately after any session failure.
Renderer code receives samples and status through Eventa. It receives no helper handle or generic window-control method.

## Excluded access

No input injection, pointer capture, screen capture, global keyboard hooks, or other application contents are required.
Do not use RemoteDesktop or InputCapture portals as passive pointer workarounds.
Do not connect this bridge to the computer-use overlay or its permissions.
The optional integration never enables itself on startup without an explicit persisted user choice.

## Release gates

1. Review the helper dependency, licensing, native packaging, and transport threat model.
2. Run the private-bus suite for framing, bus owner verification, inherited-pipe cleanup, and backpressure.
3. Prove enrollment for the actual Electron build, process tree, and native Wayland surface.
4. Verify KWin version support and unsupported-version diagnostics.
5. Test 125 percent and 200 percent outputs, negative origins, portrait layouts, seams, and gaps.
6. Test panels, virtual desktops, hotplug, compositor restart, machine suspend, and process crashes.
7. Test denied resize, delayed configure, user drag, transparent input regions, and tray recovery.
8. Verify that disable stops sampling and movement without leaving an active native service.
9. Provide explicit install, enable, disable, and removal controls. Keep these steps separate from application launch.
10. Test NVIDIA and packaged builds before enabling native capabilities by default.

Until these gates pass, describe the result as a compiled native transport with mocked script verification.
Do not claim native desktop gaze or movement is available.
