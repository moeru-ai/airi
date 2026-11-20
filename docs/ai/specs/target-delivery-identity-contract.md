# Target delivery identity contract

Status: specification. Date: 2026-11-05.

This document records the Phase 3 audit conclusion for Windows target-bound input.
It replaces the removed Phase 3 harness and executor experiments.

## Installed boundary audit (AUV 0.0.40, historical)

| Topic | Finding |
| --- | --- |
| Target parsing | `window:<id>` carries one string. It has no PID, process start time, or window generation. |
| Lookup | Enumeration finds the current window with that ID. It does not compare an approval-time observation. |
| Geometry | Window-relative points follow enumeration-time frame and child hit tests. Later moves can stale the point. |
| Background-only branch | Posts messages. It does not prove application business effect. |
| Dry-run | Stops before native child selection and submission. |

## Identity gaps (synthetic and audited)

1. Same HWND string can identify a different window lifetime after destruction and reuse.
2. PID, thread, and class alone cannot distinguish same-process HWND reuse.
3. Control swap at the same in-bounds point can change the hit-tested child without changing argv.
4. Pre-dispatch probes cannot make check-and-post atomic across asynchronous reuse.

The unit tests in `target-delivery-identity.test.ts` lock the argv counterexamples.
They do not run native Win32 fixtures.

## Host approval requirements (independent of AUV)

| Requirement | Admission |
| --- | --- |
| Verified Runtime sender | IPC-derived sender ID |
| Immutable argv and exact `--target` | Operation binding only, not lifetime binding |
| Human authorization | Main-owned confirmation for Ask mode |
| Single use and expiry | Integrated in `PendingActionManager` |
| Native input | Remains disabled without a target-bound execution contract |

## Minimum AUV proposal (not implemented)

1. Bind approved process instance, root-window lifetime, child lifetime, and point geometry at dispatch.
2. Reject missing, replaced, moved, resized, or re-hit-tested controls before submission.
3. Keep count one and background-only. Report submission separately from application effect.
4. Resolve same-handle reuse and the check-to-post race before enabling the command.
5. Add driver-boundary tests with controlled destruction, replacement, geometry change, and zero-post assertions.

If the delivery boundary cannot distinguish the original window from a reused target, the proposal stays blocked.

## Related ADRs

- [Native observation admission](../adr/2026-11-09-native-observation-admission.md)
- [Execution ownership evidence](../adr/2026-11-09-execution-ownership-evidence.md)
