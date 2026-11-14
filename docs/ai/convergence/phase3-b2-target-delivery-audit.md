# Phase 3-B2 target delivery audit

Date: 2026-11-05. This is an initial read-only contract audit.
No AUV Driver code changed. No mouse, keyboard, focus, or native click trial ran.

## Versions and evidence

- Installed CLI and SDK: 0.0.40.
- Executable SHA-256: `590e629266202147876f92e28d6d01edd94522f4ed31b3d30f1e3bffeb5a9678`.
- Audited source: `ca443e9dd7330e026fa3e36335372ae244feef4b`.
- Seventeen inspected source files match that source revision. Their hashes are in the local evidence pack.
- The executable's source-build SHA remains unverified.

This audit combines fresh installed-binary help and read-only routing probes with source review.
The Phase 3-A native Dry-run records remain historical evidence.
They are not new native input experiments in this phase.

## Routing correction

Starting a private daemon and setting `AUV_ENDPOINT` do not establish that an invoke command executes in that daemon.

The reviewed routing uses these boundaries:

| Source path, relative to AUV | Evidence |
| --- | --- |
| `crates/auv-cli/src/cli.rs:112` | Root selection comes from Device or Run arguments. |
| `crates/auv/src/selection.rs:58` | A selection without those fields is empty. An endpoint alone is not a resource selection. |
| `crates/auv-cli/src/commands/invoke.rs:82` | Empty selection uses the direct command. Selected non-Dry-run operations use the Runner adapter. |
| `crates/auv/src/local.rs:38` | Direct `open` creates a local driver session. |
| `crates/auv-cli-invoke/src/runner.rs:454` | Selected `input.clickPoint` enters `selected_click_point`. |

A fresh installed-binary probe uses only `display.list` and a unique, unavailable named pipe.
Without Run/Device selection it succeeds and records local execution.
With an explicit test Run selector it fails to connect to that pipe.
Both commands use a dummy credential and an evidence-local store.
No existing daemon or target is contacted by the selected probe.

The earliest probe variants used invalid URI syntax. Their outputs remain separate and do not count as connection-failure evidence.
The final probe uses the installed SDK's `npipe://./pipe/<name>` syntax.

Historical native Dry-run records and the earlier real Desktop read records explicitly contain `execution=local`.
Those records prove local AUV command execution, not daemon-owned execution of those commands.
The earlier screenshot and model-result evidence remains valid at that narrower scope.
Daemon startup evidence remains evidence of startup only.

The AIRI Host does not add Device/Run selection. Its caller-facing gate also rejects those routing overrides.
No routing change is part of B1 or this audit.

## Target binding on both routes

### Direct command

`commands/input.rs:901` resolves the current window with the requested numeric ID.
`commands/input.rs:921` checks invocation cancellation once before the synchronous click.
`auv-driver-windows/src/session.rs:278` maps the frame-relative point and selects background delivery.

The Windows ID is the HWND's decimal value.
The direct click has no approved process instance, window generation, child generation, or control-geometry comparison.
Hit testing selects the current child under the point.

### Selected Runner

`runner.rs:500` resolves a Window and sends a click through its window reference.
`auv/src/client/runner.rs:958` sends a Window ID and position to InputService.
`auv-cli/src/runner/local_driver.rs:755` resolves the reference again before the click.
`local_driver.rs:1107` compares only the current Window ID.
The Runner checks current bounds but does not compare an approval-time process or window lifetime.
It then enters the same Windows click path through `run_input_blocking`.

The selected route narrows stale frame handling through a fresh resolution.
It does not provide approved native root/child lifetime binding.

## Contract gaps

| Gap | Source evidence | Admission requirement |
| --- | --- | --- |
| Root identity and HWND reuse | `window.rs:95`, `:369`, `background_input.rs:267` | Distinguish the approved window lifetime from another window with the same handle. |
| Approved child identity | `background_input.rs:267` | Reject changed, replaced, reparented, or different hit-tested controls. |
| Geometry race | `session.rs:282`, `background_input.rs:280` | Reject invalid approved geometry at the final native boundary. |
| Check-to-post race | `background_input.rs:203`, `:229` | A preflight observation alone cannot make a later post atomic. |
| Cancellation after admission | `input.rs:921`, `local_driver.rs:2827` | Distinguish Host dispatch, native start, partial submission and completion. |
| Partial down/up submission | `background_input.rs:229` | Preserve uncertainty if down posts and up fails. A generic error does not prove zero effects. |
| Application effect | `session.rs:309`, `auv-driver-common/src/input.rs:636` | Keep `verified=false` until an independent application receipt establishes the effect. |
| Actual disturbance | Same `single_success` constructor | Default disturbance fields are route metadata, not a measured foreground witness. |

The posted-click helper does not inspect the transport cancellation flag between down and up.
The Runner's blocking-operation wrapper installs a flag, but installation alone does not make every native helper consume it.
Different input operations use different cancellation mechanisms.
This audit does not generalize scroll or held-input behavior to `input.clickPoint`.

Microsoft documents HWND recycling and the race after an existence check.
See [IsWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-iswindow).
`PostMessageW` returns after queue submission without a processing acknowledgement.
See [PostMessageW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-postmessagew).

## Existing checks and their limits

`BackgroundSession` retains PID, TID and class, refreshes frames, and latches an observed target loss.
Its test changes PID or class to exercise reuse rejection.
That does not establish rejection of a same-process, same-thread, same-class ABA transition between observations.
Neither reviewed click route attaches a `BackgroundSession` target.

`HeldMouse::event` retains a child and checks PID, existence and ancestry.
Direct `input.clickPoint` does not use that held-pointer path.
Neither check can be presented as an installed click guarantee without its actual caller and native evidence.

## Next contract review

The minimum unresolved contract must identify the approved root and child lifetimes at actual delivery.
It must preserve immutable point semantics, cancellation boundaries and partial-submission evidence.
An authenticated Host confirmation must approve that same operation and target.

No standalone PID check, repeated lookup, delay, retry, or foreground activation supplies the missing lifetime guarantee.
The receiver's business Oracle remains necessary even after a safe submission contract exists.

**Native write admission remains NO-GO.** Driver changes need a separate, evidence-backed minimum proposal and review.
This audit does not implement a new Runtime, binding registry, Lease framework, or approval protocol.
