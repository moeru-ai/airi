# Phase 3-B2a target delivery and verifiability

Date: 2026-11-05. Integration base: `90a5474737999d6bc1b5620b9ff130d7d5ca5096`.
Accepted B1: `2d64bbc2502d25602164781a710257164ebf84d9`.

**Recommendation: NO-GO for AIRI GUI writes.**
No production, authorization, Driver, dependency, or approval UI code changes in this slice.
The new code is an independent research runner and receiver instrumentation.

## Binary and source identity

The installed CLI and SDK report version 0.0.40.
The executable SHA-256 is `590e629266202147876f92e28d6d01edd94522f4ed31b3d30f1e3bffeb5a9678`.

The npm package provenance names commit `457ed983d1c4b005578507d44709dc2191abf28b` and tag `v0.0.40`.
An independent package download used `--ignore-scripts` in an external evidence directory.
`npm audit signatures` passed with one verified registry signature and one verified attestation.
The downloaded executable hash matches the installed executable hash.
The evidence includes the package metadata, attestation, decoded statement, and signature output.
See the [registry attestation](https://registry.npmjs.org/-/npm/v1/attestations/@auv-js%2fcli-win32-x64-msvc@0.0.40).

The audit uses files from this [published commit](https://github.com/moeru-ai/auv/tree/457ed983d1c4b005578507d44709dc2191abf28b).
Each saved file has a checked Git blob ID and SHA-256 hash.
This establishes published build provenance. It is not a reproducible local build result.

The earlier B2 audit used source `ca443e9dd7330e026fa3e36335372ae244feef4b` and left the build relationship unverified.
That checkout reports source version 0.0.35.
Its desktop behavior differs from the installed release. This document narrows and corrects those source inferences.
The original B2 report and evidence remain unchanged.

## Target resolution and delivery

All source paths below refer to the published commit.

| Boundary | Actual implementation | Guarantee and limit |
| --- | --- | --- |
| CLI target parsing | `auv-cli-invoke/src/models/mod.rs:19`, `command.rs:781` | Parses `app:`, `window:`, and `display:` into different variants. The ID contains no approved process instance or window generation. |
| Local versus selected routing | `auv-cli/src/commands/invoke.rs:78` | An empty Device/Run selection uses local execution. An endpoint alone does not select daemon execution. |
| Direct window click | `auv-cli-invoke/src/commands/input.rs:932` | Enumerates current windows and matches the ID. It checks invocation cancellation before the synchronous click. |
| Selected Runner click | `auv-cli-invoke/src/runner.rs:601`, `auv-cli/src/runner/local_driver.rs:755` | Resolves a current Window, then resolves its reference again at the Runner. Bounds checks reject points outside that current frame. |
| Native window ID | `auv-driver-windows/src/window.rs:95`, `:374` | Encodes the HWND as a decimal string. This identifies a current handle, not an immutable window lifetime. |
| Coordinate mapping | `auv-driver-windows/src/session.rs:210`, `background_input.rs:203`, `:266` | Adds the observed frame origin, descends through current children, then calls `ScreenToClient` for the selected recipient. |
| Background click | `auv-driver-windows/src/session.rs:278`, `background_input.rs:194` | Posts mouse down and up to the current hit-tested HWND. No approved root or child lifetime reaches this helper. |
| Foreground click | `auv-driver-windows/src/session.rs:278`, `:410` | Records an activation attempt, then uses global input. An activation failure does not stop that click path. |
| Text and shortcuts | `auv-driver-windows/src/input.rs:256`, `:953` | Rejects explicit application and window keyboard targets. Foreground text uses `SendInput` per UTF-16 unit. |
| Application activation | `auv-driver-windows/src/application.rs:45`, `window.rs:296` | Selects a visible window by process name, activates it, then observes foreground ownership. This does not bind later input. |

The [background helper](https://github.com/moeru-ai/auv/blob/457ed983d1c4b005578507d44709dc2191abf28b/crates/auv-driver-windows/src/background_input.rs#L194) selects a child once for that click.
It does not compare the approved PID, process creation time, root generation, or child generation before each post.
Its down and up posts are separate native calls. Partial submission remains possible.
Control movement can change hit testing without changing the CLI target string.
Fresh window bounds do not prove that the point still describes the approved control.

Background click delivery avoids driver calls that activate the foreground or move the global pointer.
It does not prove that application handlers leave foreground state unchanged.
This run cannot establish that application behavior because native click delivery remained blocked.

`BackgroundSession` retains PID, thread ID, and class, refreshes geometry, and latches observed loss.
The held-mouse path also checks its retained child and ancestry.
The reviewed CLI click path does not use either target binding.
Periodic checks also do not prove detection of same-process, same-class handle reuse between observations.
Microsoft documents both HWND recycling and the race after an existence check in [IsWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-iswindow).

## Semantic controls

The published release does include UI Automation. A claim that Windows AUV has no semantic control support is incorrect.

- Snapshots expose role, name, `AutomationId`, value, bounds, and focus state.
- `input.focusText` selects a query with a unique best score. A truncated tree or tied best score rejects selection.
- The focus path retains root and control interfaces, checks PID, thread, class, and availability, then uses `CompareElements` before `SetFocus`.
- Focus readback compares the actual focused element. It proves an observation at that point, not exclusive ownership of future keyboard input.
- Raw paths reject in `focus_text`. Separate Rust APIs can re-resolve paths for focus and selection or invocation.
- UIA value writes remain deferred in this release. `input.clickPoint` does not carry a UIA control identity.

See the [focus implementation](https://github.com/moeru-ai/auv/blob/457ed983d1c4b005578507d44709dc2191abf28b/crates/auv-driver-windows/src/accessibility.rs#L419).
Its comments explicitly separate final identity checks from atomic delivery and identify synchronous provider cancellation as unfinished work.
No focus receipt becomes a durable keyboard recipient contract.

`AutomationId` needs a container scope. It is not globally unique, as [Microsoft documents](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/use-the-automationid-property).
[UIA runtime IDs](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomationelement-getruntimeid) can also repeat over time.
Adding one of these values to an approval does not, by itself, solve target lifetime binding.

## Independent executor experiment

The [runner](../../../apps/stage-tamagotchi/scripts/phase3-executor/README.md) compiles two independent Win32 receiver processes.
It creates a private, noninteractive window station and a `Harness` desktop.
The AUV CLI, private daemon, Runner, and receivers inherit that station.
No `SwitchDesktop` call or untargeted keyboard command runs.
The outer witness stays on `WinSta0` and observes foreground events and pointer position.

The worker reports `stationVisible=false` and `canOpenInputDesktop=false`.
The installed CLI fails even for `window.list` with `input desktop attachment failed: Failed to open input desktop`.
The release calls `try_ensure_input_desktop` before enumeration and propagates its failure.
The old checkout treated this attachment as best effort.
This difference is consistent with the observed binary result.

Only the interactive window station receives user input.
`OpenInputDesktop` requires an input-capable station, as documented in [Window Stations](https://learn.microsoft.com/en-us/windows/win32/winstation/window-stations) and [OpenInputDesktop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-openinputdesktop).
The experiment preserves this isolation failure. It does not weaken the boundary to obtain a positive result.

| Experiment | Actual observation | Evidence limit |
| --- | --- | --- |
| Ten exact-target click attempts | All fail at input-desktop attachment. A and B receive zero input. | The native click helper never becomes available. These are not ten passing lifecycle-rejection tests. |
| Root close and recreation | Independent Oracle records disappearance and a new window instance. | No forced native HWND reuse and no native delivery across reuse. |
| Process replacement | New receiver PID and instance appear. | No approved-process check reaches a live click. |
| Control replacement and moved button | Oracle records child generation and a decoy at the original point. | Stale-coordinate misdelivery remains a source-level gap, not a reproduced native click. |
| Receiver pause barriers | The receiver acknowledges pause before each CLI attempt. Close or child replacement precedes queue draining. | Attachment failure occurs first. No successful queued message is observed. |
| Focus competition | The fixture requests focus inside the private station and records GUI-thread focus. | This station has no interactive foreground. Interactive focus competition remains unverified. |
| Eight explicit-target keyboard attempts | Four window targets fail at enumeration. Four application targets reject as unsupported with zero completed actions and presses. | No global `SendInput` experiment runs. |
| Application activation | Fails at input-desktop attachment. | No positive native activation result. |
| Independent UI Automation | Reads four nonclient elements. `commit` and `editor` are absent. Both requested semantic writes reject before pattern invocation. | This is a different executor. It proves neither AUV UIA delivery nor general absence of Windows UIA support. |
| Delayed endpoint and client termination | A controlled pipe accepts real selected CLI bytes, forwards none, then the parent terminates the CLI. | Transport admission only. This is not a real daemon delay or cooperative native cancellation result. |
| Real private daemon | Health and class discovery succeed. Runner window enumeration fails at attachment. A pre-aborted read rejects. | Direct CLI calls remain local. No daemon input operation or cancellation after dispatch succeeds. |

The final run has twenty direct CLI attempts, one selected transport attempt, and twenty-one case records.
All append-only receiver records show zero mouse messages, key messages, click events, text changes, and business changes.
Target B receives no input and has no business change.
The interactive witness records no foreground event and no pointer movement during this run.
Receiver processes exit successfully. The separate station lookup reports absence after owner exit.

No real Electron E2E, native click success, global keyboard delivery, or native cancellation-after-start claim follows from these records.

## Success and cancellation boundaries

| Result | What it establishes | What remains unproved |
| --- | --- | --- |
| CLI exit zero | The command returned without a reported failure. | Correct recipient and business effect. |
| `PostMessageW` success | Windows accepted a message into the recipient queue. | The recipient processed it or produced the intended effect. |
| `SendInput` count | Windows inserted that many events into the input stream. | Exclusive delivery to an approved window or control. |
| Foreground readback | The observed foreground matched at one instant. | Retention of foreground for a later operation. |
| Independent receiver Oracle | The recorded receiver state and event counts. | Unobserved applications or future effects. |

See [PostMessageW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-postmessagew) and [SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput).
The default AUV `single_success` result retains `verified=false`.
Its disturbance fields describe the chosen route. They are not a measured desktop witness.

The accepted B1 boundary remains Host dispatch commitment.
That boundary does not acknowledge native start. Request cancellation after dispatch does not retract system effects.
The selected Runner installs an input cancellation flag around blocking work.
The posted click helper does not read that flag between down and up or replace its sleeps with cancellable waits.
No extra native cancellation guarantee follows from that wrapper.
Delays, retries, foreground fingerprints, and process-name readback do not close these contracts.

## Skip audit and preserved regression results

The original B1 final test output remains **170 passed, 2 skipped**.
The second Skip is the optional receipt test at `scripts/phase3-harness/delivery-contract.test.ts:48`.
It requires `AIRI_PHASE3_EVIDENCE`. It is not a new input bypass or a removed failure test.
It entered in Phase 3-A commit `133a83982e`, before B1.
The other Skip is the opt-in read-only CLI smoke at `runtime.test.ts:132`.

With the original Phase 3-A native evidence directory, the second test runs: **171 passed, 1 skipped**.
This rechecks historical native receipts. It is not a new GUI E2E.
The original B1 red output, green output, final Host output, and evidence manifests retain their original bytes.
The red reproduction remains **10 failed, 32 passed**. The initial green file remains **42 passed**.
The final B1 chat file retains **43 tests**.

The scoped application typecheck passes.
Root lint reports **0 errors and 682 warnings**.
Every warning matches the accepted B1 lint output by path, line, column, rule, and message.
There are no added or removed diagnostics.

## Admission decision

| Operation | Decision under the requested contract | Reason |
| --- | --- | --- |
| Background click | NO-GO | Exact HWND addressing exists. Approved root and control lifetimes, final geometry, and business acknowledgement do not. Native isolated delivery remains unverified. |
| Text input | NO-GO | Explicit keyboard recipients reject. Global input has no approved HWND or control recipient. |
| Keyboard shortcut | NO-GO | The same target rejection applies. Global chord injection does not reserve application focus. |
| Window activation | NO-GO for quiet target delivery | Activation changes foreground by design. Process-name readback neither identifies one approved lifetime nor binds later input. |

The next useful experiment needs an independent disposable Windows interactive environment, such as a dedicated VM.
It must contain both receivers, the daemon, and the input desktop, with no user application in the target scope.
That environment can test native delivery, real focus competition, queued effects, daemon delays, and cancellation boundaries.
It does not, by itself, repair missing target binding.
Any Driver proposal needs separate evidence and a separate minimal patch review.

B1 stays frozen. AIRI production input stays closed. No approval UI, B0 Notice, C3, Agent Runtime, or remote push accompanies this research.
