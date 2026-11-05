# Phase 3-B2a executor research

This experiment records target-delivery limits in the installed Windows AUV release.
It does not admit AIRI input or change its approval contract.

The runner accepts only the reviewed 0.0.40 executable hash.
It expects input-desktop attachment to fail in a private, noninteractive window station.
Exit code zero means that the research completed. It does not mean that a native click succeeded.

## Components

- `station-launcher.cs` creates a disposable window station and desktop.
  It assigns the suspended worker to a job before it starts.
  Job closure kills descendants. A separate process checks station removal after owner exit.
- `../phase3-harness/native-harness.cs` supplies independently launched A and B processes.
  Each process records native identities, raw input counts, business state, and control generations.
  Receiver pause, child replacement, and focus commands require the private station.
- `uia-probe.cs` inspects semantic controls through an independent UI Automation client.
  Its writes require the private station. It has no pointer or keyboard fallback.
- `run-executor.mjs` records real CLI failures and real daemon read calls.
  Its transport barrier holds a selected CLI before daemon admission, then terminates that CLI.
  The barrier never forwards bytes. This is not a native cancellation test.
- `verify-evidence.mjs` checks all raw Oracle records and the expected blocked results.
  It does not start a native executor.

No new package is required. The .NET Framework compiler and UI Automation assemblies come from Windows.

## Run

From the repository root, use an empty directory outside the checkout:

```powershell
$evidence = Join-Path $env:TEMP ('airi-phase3b2a-' + [guid]::NewGuid())
pnpm -F @proj-airi/stage-tamagotchi exec node scripts/phase3-executor/run-executor.mjs $evidence
pnpm -F @proj-airi/stage-tamagotchi exec node scripts/phase3-executor/verify-evidence.mjs $evidence
```

The runner never calls `SwitchDesktop` or starts an untargeted input command.
Each candidate click requires an exact window target, window coordinates, and `background-only`.
A separate witness observes the interactive foreground and pointer without changing either.

The private station is a resource boundary for this trusted experiment. It is not a sandbox against hostile same-user code.
The pinned AUV release cannot enumerate its windows because it requires an input desktop.
The runner preserves this failure. It does not attach to the interactive station to continue.

## Evidence

| File | Meaning |
| --- | --- |
| `binary-identities.json` | Hashes of AUV and compiled probes. |
| `worker-isolation.json` | Worker station, desktop, visibility, and input-desktop admission. |
| `commands.json` | Twenty real direct CLI attempts, complete argv, stdout, stderr, termination, and parsed results. |
| `cases.json` | Twenty-one observations with A and B snapshots and explicit evidence limits. |
| `target-*/oracle.jsonl` | Append-only receiver records, including replaced and closed windows. |
| `uia-*.json` | Independent UI Automation results. These are not AUV results. |
| `transport-barrier.json` | One selected CLI held at transport admission, with zero forwarded bytes. |
| `daemon-readonly.json` | Real private daemon health, discovery, window failure, and pre-aborted read. |
| `interactive-witness.json` | Foreground events and pointer observations on the interactive desktop. |
| `station-closed.json` | Independent namespace check after owner exit. |
| `worker-cleanup.json` | Exit results for all three receiver processes. |

The current verifier checks one specific negative experiment.
It rejects success claims for blocked cases and checks zero input in every receiver record.
It does not establish native HWND reuse rejection, focus-race safety, or cancellation after dispatch.

See the [delivery contract](../../../../docs/ai/convergence/phase3-b2a-target-delivery-contract.md) for the source audit and admission decision.
