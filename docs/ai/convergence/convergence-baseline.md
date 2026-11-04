# Convergence baseline

Date: 2026-11-05. Accepted integration baseline: `daa6dfb3b7b3b3a506c82eff18daa9ab86f9303a`.

## Scope and evidence rules

This document separates historical research from integrated product behavior. Phase 0 changes documentation only.
Research source stays read-only. Runtime records and screenshots stay outside Git because they contain local device data.
The local evidence index records source hashes, record hashes, timestamps, and the research working-tree status.

Use these labels:

- **Research Verified**: a retained research trajectory and an independent result support the stated, limited behavior.
- **Integrated**: the current integration branch contains the production implementation.
- **Real E2E Verified**: real model, Electron Host, and AUV evidence support the behavior on the accepted baseline.
- **Not Verified**: evidence does not establish the claim, or the result belongs to another execution path.

## Source identity and inheritance

The integration working tree was clean at the accepted SHA. The research base commit was `e7812942200848f86a45807a97e8af29b024657f`.
Research runners and records are untracked additions. That base SHA alone does not identify the experimental source.
The local snapshot retains 26 selected C1/C1.1/C2 runners, fixtures, records, and receipts with SHA-256 identities.
It also hashes 163 modified or untracked research files without changing them.

| Slice | Commit | Retention |
| --- | --- | --- |
| 1: Windows PowerShell | `4fcd8ef137f1029e9b1af3908fb57d0b955255e6` | Ancestor of accepted baseline |
| 2: AUV observer | `e2c53323c378f0411fff95aaedf3cefded37014d` | Ancestor of accepted baseline |
| Linux X11 safety | `d680ed6570ba4409375747ac088078ee381850e8` | Ancestor, package tree unchanged through accepted baseline |
| 3.1: classifier | `61ca3cb6d22f92713fa5b32773839d79b5c0859a` | Ancestor, later tightened by Host policy |
| 3.2-A: attribution and approvals | `b02e3c3ab` -> `62260dd90` -> `4436457f5` -> `f8b8dedac` | Direct retained chain |
| Runtime corrections | `fd7ce22cb` -> `65ae14c79` -> `daa6dfb3b` | Profile selection, lint, queued cancellation |

The MCP package tree at the accepted baseline is `2951fe08652993deae1d84d2cb6fb0d04f7a82fe`.
All 88 files in the accepted Desktop evidence manifest still match their recorded SHA-256 values.
This verifies retained evidence integrity. It does not rerun the historical model trials.

## Capability migration matrix

| Capability | Research | Integration | Real runtime evidence | Limit or remaining work |
| --- | --- | --- | --- | --- |
| Windows PowerShell execution | Research Verified | Integrated | Not Verified through the new built-in GUI path | Terminal is a separate execution surface |
| Built-in AUV window listing | Not Verified on research path here | Integrated | Real E2E Verified | Actual Chat, Electron, daemon, and continued response |
| Whole-display capture and image read | Not Verified on research path here | Integrated | Real E2E Verified, qualified | Corrected external gateway required, one final display Oracle was occluded |
| Background window visual answer | Not Verified on research path here | Integrated | Real E2E Verified | Offscreen window, unknown nonce, native handle and pixel Oracle |
| Interleaved sessions | Not Verified on research path here | Integrated | Real E2E Verified | Original session, turn, call, and results retained |
| Stop before queued execution | Not Verified on research path here | Integrated | Real E2E Verified | Before/after failure retained, launched operations cannot be undone |
| Normal request disables Computer Use | Not Verified on research path here | Integrated | Real E2E Verified | Tool visibility is not Renderer authentication |
| Unapproved GUI input denied | Not Verified on research path here | Integrated | Real E2E Verified | Real negative IPC probes, zero actual input commands |
| Host-owned single-use PendingAction | Not Verified | Integrated | Not Verified as human approval | Contract and mocks exist, no production approval creator or UI |
| Target-bound Windows input | Not Verified | Not Verified | Not Verified | Input remains disabled even with a target flag |
| B0 approval continuation | Research implementation only | Not Verified | Not Verified | Do not migrate Notice in this round |
| C1/C1.1 safe refusal after missing target | Research Verified, qualified | Not Verified as migrated scenario | Not Verified | First observation never established the intended target |
| C1/C1.1 recovery after partial file work | Research Verified, qualified | Not Verified as migrated scenario | Not Verified | Research injected a Terminal bridge, not the production MCP approval chain |
| C1 exact initialization count | Not Verified | Not Verified | Not Verified | Substring counts include read-only checks |
| C2 two-service coordination | Research Verified, qualified | Not Verified as migrated scenario | Not Verified | Terminal/HTTP, two of three unique trials pass |
| C2 two-GUI application automation | Not Verified | Not Verified | Not Verified | HTTP service coordination does not establish GUI mutation |
| Portable multimodal gateway fix | Prior private copy only | Not Verified at Phase 0 | Not Verified outside that copy | Phase 1 owns the independent patch and tests |

## Historical trials and counterevidence

C1 and C1.1 are mixed results. Several records have an empty toolCalls array despite narrated observations.
The runners injected terminal_exec into Renderer registries and called a local HTTP shell bridge.
Those runs do not validate the production MCP approval gate or the built-in Computer Use mutation gate.
The initial cross-surface runs did not produce their required artifacts.
The missing-window trials show safe refusal. They do not prove successful relocation after a previously observed target disappeared.

C1.1 S3A recovered from a read-only destination attribute and produced the expected payload.
S3B recovered from malformed JSON through a fallback source and produced the expected payload.
S3B records step1ExecCount=2 because its Oracle counts every command containing the marker filename.
The retained commands show one Test-Path/Get-Content check and one Set-Content write.
The record therefore does not prove duplicate initialization. It also lacks an independent application mutation counter.
Keep the original failing count, its cause, and the successful output. Do not rewrite the historical record.

C2 has three unique trials. The generic normal record duplicates trial 1 and does not add a fourth trial.
Trial 1 dispatches correctly but fails receiptCreated because its JSON receipt contains a BOM.
Trial 2 passes the recorded business Oracle. The injected-maintenance recovery trial also passes.
Recovery reports three registry queries. The strict single-query check is false and is excluded from fullSuccess.
The recorded fullSuccess result does not establish efficient observation or absence of unnecessary queries.

## Retained identities

| Record | SHA-256 |
| --- | --- |
| c1-1-s3a-recovery.json | `559fa378f53f28372685ba1a46ed08cab7887260a727ca8a3261be5c0b211cbe` |
| c1-1-s3b-recovery.json | `37d3f4fef15aa0d9e7a9e363dd01cdad13ed832caad091ce722812ddc4608ed8` |
| c2-normal-record-trial1.json | `ca253df898dc6011c71291f71b11cff8d0be2dea7ee9dd2373b64a81b347bd61` |
| c2-normal-record-trial2.json | `8bbe2c7518b92d667e216a2b64a5afc6aa2da2a336763a84a7326d9159821f5b` |
| c2-recovery-record.json | `2603ec2597a33b3bc2948cc956842cd918a8de6c2b5afa2f7ffd81b17d379a24` |

## Phase result

The accepted read-only implementation and evidence are traceable. No research prototype was copied into product code.
The next phase must replace the private gateway dependency with an independently applicable patch and reproducible tests.
Phase 3 remains outside this round. Real GUI writes require separate admission and actual user approval.
