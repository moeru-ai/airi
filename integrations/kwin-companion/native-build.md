# Optional native helper build

The helper is experimental and Linux-only. The application does not import or launch it.
Building the binary does not install a KWin script or enable any desktop capability.

## Build requirements

Use a C++20 compiler, CMake 3.21 or newer, and Qt6 Core and DBus development packages.
Use Python 3 and `dbus-run-session` for integration tests.
Dynamic linking keeps Qt separate from the helper. Review distribution and licensing requirements before packaging Qt binaries.

The CMake feature flag is off by default.
Build on a development machine with the dependencies already available:

```sh
cmake -S integrations/kwin-companion/native -B build/kwin-companion \
  -DAIRI_BUILD_KWIN_COMPANION=ON -DBUILD_TESTING=ON
cmake --build build/kwin-companion --parallel 2
ctest --test-dir build/kwin-companion --output-on-failure
```

The optional install target copies only the binary into `libexec/airi`.
It does not install an autostart entry, D-Bus activation service, KWin package, or desktop setting.
The release workflow must opt in separately. Do not add it to the current default package.

For script compilation, bundle `src/script-exchange.ts` and its existing dependencies for KWin's JavaScript engine.
A generated script entry must obtain `workspace`, `KWin.WorkArea`, `QTimer`, and `callDBus` from KWin.
No auto-run entry or script package is provided until the trusted bootstrap and window mapping pass live verification.

## Verified checks

The helper and separate test peer compiled with GCC and Qt 6.8.2 headers against existing Qt6 runtime libraries.
Headers came from Debian's official `qt6-base-dev` package and its published SHA-256 was checked.
No system package or desktop component was installed during this check.

The standalone native protocol test checks JSON limits, UTF-8, numeric bounds, rectangles, process birth identities, ancestry, and pipe descriptors.
A real Node child-process check also verifies the socketpair peer credentials used by Electron-style stdio.
The TypeScript suite checks script timers, missing callbacks, stale replies, geometry readback, enrollment gates, and cleanup.

The private-bus suite could not start here. The environment rejects the temporary Unix socket with `Operation not permitted`.
The escalation path produced the same error. These integration tests remain a required CI gate.
CMake was unavailable here, so the reusable CMake build recipe itself remains unexecuted.
No live KWin compositor, native Electron mapping, or packaged desktop build was verified.

## Parent transport

Only AIRI main can spawn the helper through private inherited stdin and stdout pipes.
The helper rejects regular files, terminals, named FIFOs, and named sockets.
It accepts anonymous pipes and unnamed Unix stream socketpairs with peer credentials matching its parent.
This supports [Node child-process stdio](https://nodejs.org/api/child_process.html#optionsstdio), which does not always use actual Unix pipes. It accepts no command-line destination or window arguments.
It registers an object on its unique session-bus connection and claims no public service name.

Each stdin line contains one UTF-8 JSON object, with a maximum of 8192 bytes before the newline.
Unknown fields, malformed JSON, invalid UTF-8, and unsupported versions terminate the session.
Lease deadlines use Linux `CLOCK_BOOTTIME`, which includes time spent in suspend.
The stdout queue is capped at 65536 bytes. A blocked reader cannot create an unbounded queue.
Outbound exchange observations wrap an accepted frame and require a 16 KiB per-line limit in the future parent decoder.

The helper first emits:

```json
{ "version": 1, "type": "ready", "helperOwner": ":1.42", "parentPid": 100, "controlAvailable": false }
```

The unique owner is example data. Never copy a bus owner between sessions.

Before configuration, the main-registry gate must return a verified enrollment.
A missing native verifier returns `native-window-mapping-unverified` and must prevent helper configuration.
The trusted parent then sends:

```json
{
  "version": 1,
  "op": "configure",
  "sessionId": "fresh-session-id",
  "surfaceId": "main-stage",
  "windowId": "verified-kwin-window-uuid",
  "resourceClass": "verified-airi-class",
  "process": { "pid": 100, "birthId": "boot-id:process-start-time" },
  "layoutRevision": 1,
  "nativeMapping": "verified-main-registry-v1",
  "kwinPeer": { "uniqueOwner": ":1.10", "pid": 200, "uid": 1000 }
}
```

The mapping marker is a trusted-parent assertion, not independent proof or a renderer permission flag.
No production verifier currently produces this assertion.
The helper checks process birth identity and ancestry against its actual parent.
It then resolves the real `org.kde.KWin` unique owner, UID, and PID through the bus daemon.
Those values must match the peer pinned by the native mapping proof.
A successful configure response provides those values for the private script bootstrap.

While active, main sends a heartbeat every 250 ms:

```json
{ "version": 1, "op": "heartbeat", "sessionId": "fresh-session-id" }
```

A geometry command uses the existing strict `GeometryRequest` schema:

```json
{ "version": 1, "op": "geometry", "request": { "version": 1, "sessionId": "fresh-session-id", "surfaceId": "main-stage", "requestId": "request-1", "sequence": 1, "layoutRevision": 1, "createdAtMs": 1000, "bounds": { "x": 100, "y": 100, "width": 200, "height": 300 } } }
```

The timestamp above is example data and is stale in a real session.
The helper permits one queued or in-flight command. It rejects stale commands and out-of-work-area targets.
The script applies the stricter per-step and current-output limits before any compositor write.
The compositor readback deadline is 300 ms. The helper allows 750 ms for readback and acknowledgement transport.

Disable uses:

```json
{ "version": 1, "op": "disable", "sessionId": "fresh-session-id" }
```

Disable clears queued commands and exits the helper within a bounded interval.
The host must also stop or unload its exact script instance for immediate remote sampling shutdown.
Without that host control, the script's independent timer stops it within its 1000 ms lease.
Pipe EOF, process exit, changed bus ownership, lost acknowledgements, and queue overflow also revoke control.

## D-Bus exchange

The script calls only the pinned helper owner at `/org/airi/Companion`, interface `org.airi.Companion1`, method `Exchange`.
The method accepts one JSON string and returns one JSON string.
`src/script-exchange.ts` defines the strict hello, poll, and reply schemas.
No D-Bus method can configure, enroll, or select a window.

The native helper verifies the actual message sender and rechecks current KWin ownership before returning a command.
It also validates sample timestamps, sample sequence, layout revision, output containment, and matching acknowledgements.
The script has a separate timer because KWin can omit a D-Bus error callback.

## Integration-test scope

`tests/native-transport.py` always creates a fresh private D-Bus session.
Its test peer claims `org.kde.KWin` only inside that isolated bus. It is not a compositor.
The suite covers caller rejection, enrollment assertions, process identity, framing, command routing, work areas, leases, EOF, disable, and backpressure.
Passing it establishes transport behavior only. It does not establish correct native window mapping or desktop movement.
