# Phase 3 target-bound input research

Status: closed. Production still denies unbound native GUI input.

## Context

Phase 3 research audited Host approval timing, AUV `window:<id>` delivery, and Win32 lifetime reuse.
The repository contained a native harness and a Phase 3 executor for local evidence only.
Those runners are removed. Decisions and contract limits stay in the spec below.

## Decision

**NO-GO** for target-bound background clicks through stock `input.clickPoint` with only `window:<hwnd>`.

- Approval must bind process instance, window lifetime, child control, and geometry before dispatch.
- Dry-run success does not prove safe native submission.
- Terminal approval and Computer Use Host approval stay independent lanes.

Host approval timing repairs from the same research cycle are integrated in Main.
They do not enable native input.

## Consequences

- Keep input closed until AUV and Host expose a lifetime-bound target contract.
- Keep simulation counterexamples in `apps/stage-tamagotchi/src/main/services/airi/computer-use/target-delivery-identity.test.ts`.
- Read the [target delivery identity contract](../specs/target-delivery-identity-contract.md) for audit detail and the minimum AUV proposal.
