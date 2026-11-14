# Phase 3-A native Harness

This fixture supports a target-delivery admission review.
It does not enable AIRI GUI input, request human approval, or run a live click.

## Files

- `native-harness.cs`: two independently launched Win32 Forms with button messages, business state, and foreground witnesses.
- `run-dry-run.mjs`: compiles the fixture, starts a private AUV daemon, and runs six commands with mandatory `--dry-run`.
- `delivery-contract.test.ts`: synthetic identity counterexamples and an optional real-receipt check.
- `../../src/main/services/airi/computer-use/chat-runtime.test.ts`: Host failure paths with Mock OS boundaries.

No dependency or production configuration change is required.

Phase 3-B2a reuses the receiver with private-station controls for pause, focus, and child replacement.
Those controls reject calls outside that station. This runner retains mandatory `--dry-run`.
See the separate [executor experiment](../phase3-executor/README.md) for its evidence boundaries.

## Windows prerequisites

- Workspace dependencies installed, including AUV CLI and SDK 0.0.40.
- The Windows .NET Framework compiler at `%WINDIR%/Microsoft.NET/Framework64/v4.0.30319/csc.exe`.
- Windows Forms, System.Drawing, and System.Web.Extensions Framework assemblies.
- Node and pnpm from the workspace environment.

A .NET SDK is not required.

## Run without input injection

From the repository root, run:

```powershell
$env:AIRI_PHASE3_EVIDENCE = Join-Path $env:TEMP ('airi-phase3-' + [guid]::NewGuid().ToString('N'))
pnpm -F @proj-airi/stage-tamagotchi exec node scripts/phase3-harness/run-dry-run.mjs $env:AIRI_PHASE3_EVIDENCE
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/main/services/airi/computer-use scripts/phase3-harness/delivery-contract.test.ts --reporter=verbose
pnpm -F @proj-airi/stage-tamagotchi typecheck
```

The output directory must be empty and outside the repository.
Existing records cannot satisfy a new run.
The runner never deletes existing evidence.

Each fixture process opens one off-screen window without activation or a taskbar entry.
The runner closes both fixtures and its private, unregistered AUV daemon in `finally`.
Each fixture also has a 180-second lifetime limit.
No ordinary AIRI window, model connection, provider credential, or user profile is needed.

The file-control commands are snapshot, control swap/restore, size change/restore, move, replace, close, and stop.
They operate only on the fixture's own windows.
There is no input or approval command.

## Evidence

| Artifact | Meaning |
| --- | --- |
| `compile.json`, `harness-identity.json` | Compiler output and exact fixture source/executable hashes |
| `plans.json` | Full CLI argv, stdout, stderr, and exit code. No launcher token. |
| `auv-store` | Actual AUV records for Dry-run operations |
| `target-a/oracle.jsonl`, `target-b/oracle.jsonl` | Independently maintained native identity, input counts, and business state |
| `states.json` | Acknowledged lifecycle and geometry scenarios |
| `oracle-verdict.json` | Before/after Oracle and explicit NO-GO result |
| `cleanup.json` | Owned process IDs and exit results |

`NO-GO` is the expected review result. Exit zero means the diagnostic scenarios completed with zero observed input.
A passing counterexample test can confirm a safety gap. It does not authorize a write.

The synthetic ABA cases do not force or claim actual Windows handle reuse.
Dry-run does not enter child hit testing or `PostMessage`.
The native positive button path remains untested.
The fixtures do not protect against arbitrary code with the same Windows user privileges.

Native records contain local process identities and paths. Keep them outside Git.
The [delivery review](../../../../docs/ai/convergence/phase3-target-delivery-contract.md) and [approval review](../../../../docs/ai/convergence/phase3-approval-admission.md) define admission limits.
