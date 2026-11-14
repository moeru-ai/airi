# Phase 3-A target delivery contract

Date: 2026-11-05. AIRI baseline: `d3fc96c75e0390e8d235736b615574564d62680f`.

**Decision: NO-GO for Phase 3-B.** The installed command does not bind a click to the window lifetime observed before approval.
This review adds fixtures and tests. It does not change AIRI authorization or AUV production code.

## Evidence levels and identities

| Item | Identity | Evidence |
| --- | --- | --- |
| Installed AUV | CLI 0.0.40 | Actual `--version`, help, and six native Dry-run calls |
| Installed executable SHA-256 | `590e629266202147876f92e28d6d01edd94522f4ed31b3d30f1e3bffeb5a9678` | Hash of the executable resolved by `@auv-js/cli/binary` |
| Audited AUV source | `ca443e9dd7330e026fa3e36335372ae244feef4b` | Seven source files, exact excerpts, Git blobs, and file hashes in the local evidence pack |
| Binary source revision | **Not verified** | A version number does not prove an executable's source revision |
| Native input delivery | **Not run** | Every candidate call contains `--dry-run` |
| Electron approval | **Not run** | Production Host logic runs with Mock process and Electron boundaries |

The AUV worktree contains unrelated changes. The inspected files match the named source revision.
This review does not attribute unverified source behavior to the installed executable.

## Audited call chain

Source paths below are relative to the separately identified AUV checkout.

| Boundary | Source anchor | Behavior and missing guarantee |
| --- | --- | --- |
| Target parsing | `crates/auv-cli-invoke/src/models/mod.rs:12` | `window:<id>` carries one string. It has no PID, process start time, or window generation. |
| Exact lookup | `crates/auv-cli-invoke/src/commands/input.rs:901`, `crates/auv-driver-common/src/window.rs:37` | Enumerates current windows and finds the same ID. It does not compare an approval-time observation. |
| Native ID encoding | `crates/auv-driver-windows/src/window.rs:95`, `:369` | Encodes HWND as a decimal `isize` string and parses it back. |
| Window point | `crates/auv-cli-invoke/src/commands/input.rs:913` | Checks the point against the currently enumerated window's frame size. |
| Window to screen | `crates/auv-driver-windows/src/session.rs:210`, `:731` | Adds the observed frame origin. It does not refresh the frame here. |
| Policy branch | `crates/auv-driver-windows/src/session.rs:278` | Background policies use the posted-message path. Foreground activation belongs to a different branch. |
| Child selection | `crates/auv-driver-windows/src/background_input.rs:267` | Starts at the raw HWND and descends through hit-tested child windows. |
| Client point | `crates/auv-driver-windows/src/background_input.rs:280` | `ScreenToClient` maps the screen point into the selected child's client coordinates. |
| Native submission | `crates/auv-driver-windows/src/background_input.rs:229`, `:293` | Posts button-down and button-up messages. There is no approved owner, lifetime, child, or geometry comparison. |
| Returned result | `crates/auv-driver-windows/src/session.rs:309` | Reports a successful delivery path after posting. It does not read the application's business state. |

Dry-run stops before `session.window().click`. It neither selects the native child nor posts a mouse message.
A successful Dry-run cannot establish the safety of those omitted stages.

## Answers to the eight delivery questions

1. **Window ID and HWND:** The source uses the raw HWND value as the ID.
   A live native fixture's HWND and PID match the installed command's returned Window.
   This identifies a current window, not one permanent window lifetime.

2. **Original process:** Enumeration reports the current PID.
   The direct click path does not compare it with an approved PID or process instance.
   An AIRI preflight check cannot close the later lookup and posting races.

3. **HWND destruction and reuse:** The lookup accepts the current window with that numeric handle.
   A replacement can therefore satisfy the same target string.
   The native fixture replaced its window once. Windows assigned a different HWND in that run.
   Same-handle reuse is a controlled synthetic counterexample, not a claimed native reproduction.
   Microsoft documents handle recycling and the race after `IsWindow`. See [IsWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-iswindow).

4. **Geometry and controls:** Window-relative coordinates follow a move completed before enumeration.
   A move after enumeration can stale the screen point before `ScreenToClient`.
   A resized window can reject an out-of-bounds point.
   A different control at an in-bounds point remains selectable.
   The real fixture swapped its two controls. Dry-run accepted the original point while the independent hit test identified the decoy.

5. **Coordinate conversions:** CLI coordinates refer to the window frame, not directly to its client area.
   The source frame prefers DWM extended bounds and falls back to `GetWindowRect`.
   CLI and driver add that frame origin. The native helper then converts to child-client coordinates.
   The direct helper packs coordinates into 16-bit message fields without the held-mouse path's explicit range check.
   The small fixture does not exercise coordinate overflow or mixed-DPI behavior.

6. **Background-only:** The reviewed branch does not call foreground activation or fall back to hardware input.
   This proves the branch's intent, not every target application's response to posted messages.
   An application can activate itself while processing input.
   No real click occurred, so application-driven focus behavior remains unverified.

7. **Submission versus effect:** A successful `PostMessageW` means queue submission.
   It does not prove that the receiving thread processed the message or committed the intended operation.
   The fixture records native button messages, Click events, one-time commits, and the resulting nonce separately.
   See [PostMessageW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-postmessagew).

8. **Existing reusable checks:** `window::probe_window` reads PID, TID, class, frame, and current existence.
   `BackgroundSession` captures PID/TID/class, rejects observed owner changes, and latches an observed loss.
   It refreshes geometry before its own click path.
   The CLI path above does not attach or use that session.
   Its polling still cannot distinguish destruction and recreation with the same HWND, PID, TID, and class between probes.
   It also does not bind the original child control or make check-and-post atomic.
   `HeldMouse::event` checks PID and child ancestry, but direct `input.clickPoint` does not use that path.

`GetWindowThreadProcessId` supplies a current owner observation, not a window-generation identifier.
See [GetWindowThreadProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid).

## Native fixture and independent Oracle

The [fixture](../../../apps/stage-tamagotchi/scripts/phase3-harness/native-harness.cs) runs two separate processes.
Each owns a Win32 Form, a commit button, a decoy button, a random window instance, and a random nonce.
Windows stay outside the visible desktop with `WS_EX_NOACTIVATE`, `WS_EX_TOOLWINDOW`, and no taskbar entry.

The fixture reports these independent observations:

- Native root and child HWND, PID, TID, class, frame, and current existence.
- Process start time, executable, fixture instance, and window generation.
- Button-down, button-up, keyboard, and Click event counts for both controls.
- One-time business commit count and the resulting window nonce.
- Complete Target B window and business state before and after the trial.
- Foreground snapshots and a read-only foreground WinEvent hook.

The file-control protocol changes fixture geometry or lifecycle. It has no click, typing, approval, or business-commit command.
The fixture source has no `SendInput`, `PostMessage`, `SendMessage`, or `PerformClick` delivery call.
Native button handlers own business changes. The runner does not write a successful business result.

The final native run has these results:

| Scenario | Installed CLI result | Independent observation | Limit |
| --- | --- | --- | --- |
| Exact original target | Dry-run succeeds | Returned HWND/PID match Target A | No native click |
| Controls swap | Dry-run succeeds at old coordinates | Old point now identifies the decoy | Demonstrates missing control admission, not actual wrong-control delivery |
| Window shrinks | Dry-run fails bounds validation | Fixture reports the smaller frame | No input dispatch |
| Window moves | Dry-run succeeds with a new screen point | Fixture reports the moved frame | No post-enumeration race test |
| Window replacement | Old HWND is not found | Same process, new window instance and different HWND | Actual same-handle reuse did not occur |
| Target closes | Closed HWND is not found | Native existence is false | No input dispatch |
| Target B | No command targets B | Complete window/business snapshot stays identical | Not a positive click validation |

All native input counters and business changes are zero.
The final run records no foreground change. Earlier retained runs record other foreground handles, never a fixture window.
Those earlier records do not prove the desktop stayed unchanged or establish who caused the changes.
The first runner also published an unready replacement handle. Its logs remain as a fixture failure.
The corrected fixture obtains real handles before acknowledging replacement.
The runner now requires an empty output directory to reject stale receipts.

The positive button-message and business-commit path remains untested until separate admission permits real input.
The fixture is not a security boundary against arbitrary code running as the same Windows user.

## Independent minimum AUV proposal

This is a proposal, not an applied fix or an assurance that a PID check solves reuse.
The AIRI checkout does not copy Windows input-driver logic.

1. Define an operation-specific expected target at the existing AUV click boundary.
   It must identify the approved process instance, root-window lifetime, child lifetime, and point geometry.
2. Reuse the native probe and existing driver result types.
   Reject missing, replaced, moved, resized, or different hit-tested controls before submission.
3. Keep count one, background-only, and no retry after any submission or uncertain result.
   Report submission separately from application effect, including partial down/up submission.
4. Resolve same-process, same-class HWND reuse and the final check-to-post race before enabling the command.
   PID/TID/class polling and asynchronous WinEvent callbacks alone do not prove an atomic lifetime binding.
   A cooperative fixture's generation check is one investigation option, not a general Windows guarantee.
5. Add driver-boundary tests with controlled destruction, same-value replacement, geometry changes, and a zero-post assertion.
   Admit a build only after those tests establish the required boundary.

If the final delivery boundary cannot distinguish the original window from a reused target, the proposal remains blocked.
No delay, repeated lookup, focus change, or retry can replace that missing guarantee.

The [approval review](./phase3-approval-admission.md) defines the independent Host requirements.
