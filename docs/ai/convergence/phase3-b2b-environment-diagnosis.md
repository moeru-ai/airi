# Phase 3-B2b execution environment diagnosis

Date: 2026-11-05. Accepted research base: `28f8adda82af71aa3332fc3290d6524568aef3d0`.

**The read-only diagnosis is complete. Native input experiments remain blocked. AIRI GUI writes remain NO-GO.**

The two measured environments explain the B2a refusal.
The noninteractive station does not satisfy the input-capable window station prerequisite.
The shared user desktop permits AUV to resolve an owned Harness window.
That read result does not establish input submission, recipient delivery, or business effect.

No AUV Driver, AIRI production code, approval entry, or B1 state changes in this slice.
No mouse, keyboard, focus, activation, clipboard, or UI Automation action runs.

## Read-only experiment

The [diagnostic runner](../../../apps/stage-tamagotchi/scripts/phase3-executor/diagnose-environment.mjs) reuses the B2a station owner and Win32 receiver source.
It creates A and B in two contexts: the shared user desktop and a private noninteractive station.
The receivers stay offscreen and request no activation.
Each context starts its own unregistered AUV daemon with overlays disabled.
The only Driver request resolves A by its process ID.
Daemon health and Runner metadata supply the identities of the actual AUV processes.

The independent [native probe](../../../apps/stage-tamagotchi/scripts/phase3-executor/environment-probe.cs) reads:

- Process Session ID, token Session ID, integrity RID, elevation, and UIAccess.
- Session connection state and the active console Session ID.
- Observer Window Station, station visibility, and current thread desktop.
- Input Desktop access with `DESKTOP_READOBJECTS` and the access mask used by the published Driver.
- Available peer thread desktops and each target HWND's owning PID and thread.
- The desktop's input-receiver flag through `GetUserObjectInformationW(UOI_IO)`.
- Visible window counts outside the supplied test processes. It does not collect their titles.

The probe opens process handles with `PROCESS_QUERY_LIMITED_INFORMATION` and tokens with `TOKEN_QUERY`.
It never changes token privileges or desktop assignments.
It closes its own token, process, and opened desktop handles.
It does not close borrowed handles from `GetThreadDesktop` or `GetProcessWindowStation`.

## Observed boundary

Exact identities, machine values, argv, and raw records stay in the external evidence directory.

| Signal | Shared user desktop | Noninteractive station |
| --- | --- | --- |
| Process and token Session | Same active, nonzero Session as the other context | Same as the shared context |
| AUV and target integrity | Same measured level and elevation as the other context | Same as the shared context |
| Station visibility | Visible | Not visible |
| Observer and target desktops receive input | Yes | No |
| Input Desktop, read access | Opens and closes successfully | Refuses with `ERROR_INVALID_FUNCTION` |
| Input Desktop, Driver access mask | Opens and closes successfully | Same refusal |
| AUV target resolution | Returns the exact independently observed A HWND | Refuses during input-desktop attachment |
| Input commands | None | None |

The same Session and integrity level coexist with different Window Station capabilities.
Neither Session membership nor elevation alone proves access to an Input Desktop.
The read-access refusal also separates this result from a refusal caused only by the Driver's broader requested mask.

Microsoft requires an input-capable station for [OpenInputDesktop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-openinputdesktop).
Only the interactive station receives user input, as documented in [Window Stations](https://learn.microsoft.com/en-us/windows/win32/winstation/window-stations).
This explains the B2a setup without removing or bypassing its existing check.
It does not establish that AUV cannot click on an ordinary interactive desktop.

## Attribution and sampling limits

`GetProcessWindowStation` describes its calling process. It has no peer-PID argument.
The probe does not mislabel an observer reading as a direct peer-station query.
For available peer desktops, it uses `CompareObjectHandles` against the observer's borrowed desktop handle.
An independent `OpenDesktop` of that same desktop calibrates the comparison first.
The measured AUV processes have available thread samples that match the observer's desktop object.
Both target UI threads also match that object and their independently observed owner PIDs.

Some peer thread desktop queries return unavailable.
Their raw last-error values remain in the evidence, including zero and values without an established cause.
The diagnosis does not classify these values as permission failures or replace missing samples with the observer's data.
No retry turns unavailable threads into a claim that all executor threads were observed.
The raw records identify which thread observations succeeded.

These facts establish point-in-time context. They do not bind a later input recipient or reserve foreground ownership.
The probe does not trace an instruction at native input dispatch because no input request runs.
See [GetThreadDesktop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getthreaddesktop),
[CompareObjectHandles](https://learn.microsoft.com/en-us/windows/win32/api/handleapi/nf-handleapi-compareobjecthandles),
and [GetUserObjectInformationW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getuserobjectinformationw).

## Published AUV preconditions

The executable remains the reviewed 0.0.40 artifact from commit `457ed983d1c4b005578507d44709dc2191abf28b`.
Its SHA-256 remains `590e629266202147876f92e28d6d01edd94522f4ed31b3d30f1e3bffeb5a9678`.
The B2a package provenance remains the source basis.

- [`window.rs:240`](https://github.com/moeru-ai/auv/blob/457ed983d1c4b005578507d44709dc2191abf28b/crates/auv-driver-windows/src/window.rs#L240) requires input-desktop attachment before window enumeration.
- [`desktop.rs:147`](https://github.com/moeru-ai/auv/blob/457ed983d1c4b005578507d44709dc2191abf28b/crates/auv-driver-windows/src/desktop.rs#L147) opens the Input Desktop before the current-desktop comparison or any reassignment.
- [`permission.rs`](https://github.com/moeru-ai/auv/blob/457ed983d1c4b005578507d44709dc2191abf28b/crates/auv-driver-windows/src/permission.rs) reports elevation, UIAccess, and nonzero Session membership. It does not test station input capability.
- [`commands/app.rs:42`](https://github.com/moeru-ai/auv/blob/457ed983d1c4b005578507d44709dc2191abf28b/crates/auv-cli-invoke/src/commands/app.rs#L42) keeps the public `app.probePermissions` route macOS-only.

The installed Windows CLI also returns Unsupported for that public permission command.
The independent probe supplies the missing diagnostic observations. It does not become a new product permission service.
Daemon readiness and window resolution remain distinct from native input admission.

## Controlled input admission

The accessible input desktop is the shared user workspace.
It contains visible windows outside the experiment and an unrelated foreground window.
The registered VirtualBox entry is inaccessible. No running or admitted disposable Windows guest was found.
The current shell has no Hyper-V command or service, and its virtualization namespace query fails.
This inventory does not claim that every possible remote or unregistered environment is absent.

No dedicated interactive test environment meets the isolation requirement for this run.
The native experiment stops here. It does not move from the private station to the shared desktop to obtain a passing click.
It does not boot, repair, or reconfigure a VM or change desktop security.

Before a later minimal click experiment, a separate environment review must identify a disposable interactive context containing A, B, and AUV.
Existing checks must stay active. The target must remain an owned Harness process.
That experiment must separate OS submission, receiver events, and business state with independent records.
It still cannot infer lifecycle, focus-competition, or cancellation guarantees from one successful click.

## Evidence and research scope

The evidence contains both native-context snapshots, exact AUV process identities, owned-window resolution, receiver logs, build receipts, and cleanup records.
Twelve receiver records contain zero input events and zero business changes.
The independent desktop witness records unchanged foreground and pointer observations during this run.
Receiver cleanup succeeds. A separate lookup confirms removal of the owned station after owner exit.

B1 and accepted B2a evidence remain unchanged.
No new Skip or native-input test matrix accompanies this diagnosis.
There is no Driver rewrite, GUI scheduler, target fingerprint system, shared Runtime, or approval UI.

This GUI admission limit does not become a prerequisite for separately scoped observation, Terminal, information-gain, or decision experiments.
Those experiments retain their own contracts and admission decisions.
This slice does not start C1.1, C2, or C3 work.
