# Phase 4.0 baseline audit

Date: 2026-11-05. Audited product HEAD: `28f0eaf14c2995fd504f72fa6a26e3c59c387897`.

Gate 4.0 recommendation: **GO for the isolated, read-only A/B experiments described here, after independent review**.
**Task C and Phase 4.4 are Blocked. Real GUI input remains NO-GO.**
This delivery stops at Phase 4.0. It contains documentation only.
No new model trial, Desktop launch, shell tool execution, or native input experiment ran during this audit.

## Baseline identity

The branch is `integration/upstream-baseline`. The initial working tree was clean.
Git ancestry establishes this sequence:

```text
daa6dfb3b -> 07993ffd4 -> f1d15cdb5 -> 0baa9eac1 -> 944d18407
 -> d3fc96c75 -> 133a83982 -> 2d64bbc25 -> 90a547473
 -> 28f8adda8 -> 28f0eaf14
```

`d3fc96c75` contains the MCP authorization corrections.
`2d64bbc25` contains the accepted B1 authorization timing correction.
`28f8adda8` and `28f0eaf14` add B2a/B2b research evidence without new production input permission.
The Windows PowerShell, AUV observer, and Linux X11 safety commits remain ancestors.

| Source tree | Accepted `daa6dfb3b` | Audited HEAD |
| --- | --- | --- |
| Core Agent | `0943baa1324ecbd7231f980891c420f595184038` | Same |
| Stage Chat LLM integration | `aa9122351b3ffff47b63376aa90258d9a0e0fde4` | Same |
| Desktop tool registration | `6ada5fa9cf73292e670d6be52dbebb817af0c897` | Same |
| Main Computer Use module | `da50363e5d336ef47aaa6d8feaef3ba9815bdfb0` | `fa4e991390048f8f49bbccd9e43cc2f6a44b33de`, same as B1 |
| Independent MCP package | `2951fe08652993deae1d84d2cb6fb0d04f7a82fe` | `91ba4b95b5de14258eb45f374869c899da366d04`, same as B1 |

The audit environment uses Windows NT build `29648.1000`, Node `26.10.0`, pnpm `11.24.0`, and PowerShell `7.6.5`.
The registry reports `Windows 10 Pro` and `DisplayVersion=Dev`. The installed Electron package is `43.8.4`.
AUV CLI is `0.0.40`, with SHA-256 `590e629266202147876f92e28d6d01edd94522f4ed31b3d30f1e3bffeb5a9678`.
That binary matches the retained Desktop trial binary. Its identity alone does not establish current native execution.

## Actual call paths

### Built-in AUV

```mermaid
flowchart TD
  U[User request with Use computer] --> C[Stage Chat.send and request session]
  C --> O[Core Chat orchestrator]
  O --> L[Stage LLM adapter and Tool Resolver]
  L --> G[Core protocol adapter and xsAI tool loop]
  G --> R[Registered computer_use or computer_use_read_image]
  R --> I[Eventa Renderer to Main IPC]
  I --> H[Actual Electron sender and Main command gate]
  H --> Q[Host serial queue and cancellation checks]
  Q --> D[AUV daemon readiness and launcher credential]
  D --> X[Local AUV CLI process with managed store]
  X --> V[Native observation and artifacts]
  V --> I
  I --> T[SDK tool result and next model generation]
  T --> O
  O --> S[Assistant transcript in original session and turn]
```

The leader Renderer registers Desktop tools during [App startup](../../../apps/stage-tamagotchi/src/renderer/App.vue).
[Built-in registration](../../../apps/stage-tamagotchi/src/renderer/stores/tools/built-in.ts) marks both tools inactive by default and requires explicit selection.
[Stage Chat](../../../packages/stage-ui/src/stores/chat.ts) binds current request tool references and the original session.
History cannot reactivate an explicitly selected Computer Use tool for another request.

[Tool Resolver](../../../packages/stage-ui/src/stores/ai/chat-llm/tool-resolver.ts) binds session and turn attribution in each execution closure.
The SDK supplies the actual tool-call ID. The model schema contains `argv`, not an approval grant.
[Main service](../../../apps/stage-tamagotchi/src/main/services/airi/computer-use/index.ts) obtains the actual sender from Electron.
[Main runtime](../../../apps/stage-tamagotchi/src/main/services/airi/computer-use/runtime.ts) classifies immutable argv and controls routing, credentials, and storage.

Daemon readiness precedes CLI dispatch. This path does not select a Run or Device.
The CLI uses its local execution path. A daemon connection does not prove daemon-owned execution of each desktop command.
The image reader returns image content from the managed artifact store.

[Core orchestration](../../../packages/core-agent/src/runtime/chat-orchestrator-runtime.ts) awaits tool results and records the generated transcript under the captured session.
Its final commit uses that session ID, not the currently selected UI conversation.
Request cancellation invalidates queued work. After dispatch, the Host retains actual settlement.
Cancellation does not revoke a system effect that already occurred.

### Independent MCP

```mermaid
flowchart TD
  U[Normal Chat request] --> C[Stage Chat and Core orchestrator]
  C --> R[Tool Resolver includes active MCP proxies]
  R --> M[Model calls builtIn_mcpListTools]
  M --> P[Model calls builtIn_mcpCallTool with server::tool]
  P --> E[Renderer Eventa MCP IPC]
  E --> H[Main MCP manager and configured client]
  H --> S[Stdio or HTTP MCP server]
  S --> B[Registered tool policy and backend]
  B --> H
  H --> T[Normalized MCP result inside proxy result]
  T --> G[SDK tool message and next generation]
  G --> C
  C --> O[Original conversation transcript]
```

[Renderer MCP registration](../../../apps/stage-tamagotchi/src/renderer/stores/tools/mcp.ts) installs the two proxies through the normal tool store.
They are active by default. Computer Use selection does not gate these separate proxies.
[Proxy tools](../../../packages/stage-ui/src/tools/mcp.ts) discover descriptors and forward a qualified name with JSON arguments.
[Main MCP manager](../../../apps/stage-tamagotchi/src/main/services/airi/mcp-servers/index.ts) resolves the server and calls its MCP client.
The default server catalog is empty.

This establishes a conditional product route after operator config and server connection.
It does not establish a currently connected Terminal server or a real Chat Terminal trial.
No private user MCP config changed or served as proof of Terminal admission.
Main forwards tool name and arguments. This route does not forward Chat attribution or its abort signal to the independent server.

### Terminal

```mermaid
flowchart TD
  C[Normal Chat MCP proxy route] --> T[Configured server registers terminal_exec]
  T --> P[Action policy evaluates command]
  P --> A[actions or all requires approval]
  A --> Q[MCP server pending action]
  Q --> X[Public self-approval denied]
  Q -.-> H[Trusted human approval adapter absent]
  P --> N[Explicit operator approvalMode=never]
  N --> E[Action executor]
  E --> S[Background local shell process]
  S --> R[Exit code, stdout, stderr and timeout fields]
  R --> C
```

[Server registration](../../../services/computer-use-mcp/src/server/register-tools.ts) exposes `terminal_exec` through MCP.
[Action executor](../../../services/computer-use-mcp/src/server/action-executor.ts) reaches [local shell runner](../../../services/computer-use-mcp/src/terminal/runner.ts) only after policy admission.
The shell is independent of the built-in AUV command gate.
Windows execution uses a background PowerShell process, not GUI keyboard injection.
The effective directory starts at server process cwd and persists in runner state unless the next call supplies cwd.
The result reports cwd. Phase 4.0 does not change that contract.

Source registration does not equal available execution from normal Chat.
**No trusted production human-approval adapter for Terminal is installed at this HEAD.**
Task C cannot use `never`, an injected executor, or a test-only approval helper as a substitute.

## Authorization and isolation limits

[Policy](../../../services/computer-use-mcp/src/policy.ts) requires approval for every `terminal_exec` in `actions` and `all`, including a read-only command.
`actions` gates mutations and selected sensitive reads. `all` gates actions in the common action pipeline.
These modes are not universal gates for every independently registered read handler.
The exact `never` value represents broad startup authority from the operator.
It does not create a shell sandbox or narrow approval for one command.

In `actions` and `all`, `desktop_approve_pending_action` rejects the model before it consumes or runs a pending action.
Workflow automatic approval, approved resume, raw CDP mutations, and delegated browser execution retain the `d3fc96c75` restrictions.
PTY grants and internal helper functions do not supply a trusted human entry.
The independent server pending map lacks Main-owned Chat identity, expiry, and cancellation integration.
It is separate from the built-in Host PendingAction manager.

The built-in manager has no production creator or approver caller.
Input preconditions remain closed. B1 consumes authorization after daemon readiness, immediately before synchronous CLI dispatch.
The older [authorization boundary report](execution-authorization-boundary.md) describes the earlier consume-before-readiness behavior.
That timing paragraph is historical and does not describe the audited HEAD.

Normal Chat attribution and trusted authority are different facts:

- Normal Chat supplies request provenance and the SDK tool-call ID.
- Main independently obtains the Electron sender. Renderer session and turn labels remain claims from that sender.
- Same-Renderer forged read attribution passed a retained direct-IPC probe. It did not grant GUI input.
- Screenshot preview storage restricts paths to one managed store, without per-session ACLs.
- Renderer MCP management IPC can write server config, restart servers, and test arbitrary configured commands.

The last item follows from source review of [management handlers](../../../apps/stage-tamagotchi/src/main/services/airi/mcp-servers/index.ts).
[Server config](../../../apps/stage-tamagotchi/src/shared/mcp-config.ts) accepts command, arguments, and environment.
This audit did not run a compromised-Renderer exploit.
The ordinary model proxy does not directly expose those management handlers.
The built-in input gate is not a containment boundary for a compromised Renderer or an independently authorized shell.

The existing Terminal/GUI policy remains unchanged.
The built-in Host has a serial queue. Independent MCP has a pending map and independent shell dispatch.
Advisory lane guidance does not establish a shared execution mutex.
Active PTY state and `concurrencySafe: false` metadata do not establish that mutex.
Neither `dry-run` nor the AUV input ban makes an independently configured Terminal harmless.
The A/B plan therefore excludes external MCP servers and real shell tools.

## Agent loop, budgets, and failure semantics

| Layer | Actual limit or measurement | Meaning |
| --- | --- | --- |
| Core Chat Completions and Responses | `stopWhen: not(hasToolCall())` | No numeric tool-round or call limit |
| Model output | Optional `maxTokens` | Per generation, not the complete turn |
| SDK dispatch | Multiple calls per generation, concurrent dispatch | Generation count differs from tool-call count |
| Core retry | Transient failures before observable stream output | Not a general replay after tool execution |
| Built-in Host | Serial queue, 120-second CLI timeout, 4 MiB process buffer | Per CLI dispatch, not total turn time |
| Main MCP client | 10-second request timeout, 15-second maximum | Transport limits do not prove backend cancellation |
| Independent MCP common action pipeline | 80 operations and 160 operation units by default | Server-session accounting, not per Chat turn or the complete MCP catalog |
| Independent MCP pending map | 24 pending actions by default | Shared map capacity, not a model call limit |
| Terminal command | 15-second default, public override up to 120 seconds | Spawned shell duration, not all preflight and audit work |
| Terminal output | 16,384 JavaScript characters for each output stream | Truncation flags and original lengths remain separate |
| Workflow | Step list and retry limits | No common end-to-end deadline |

[Chat Completions](../../../packages/core-agent/src/runtime/chat-completions.ts) and [Responses](../../../packages/core-agent/src/runtime/responses.ts) explicitly override the SDK default stop condition.
Installed xsAI `0.5.1` dispatches several tool calls through `Promise.all`.
[Generation token tests](../../../packages/core-agent/src/runtime/generation-token-limit.test.ts) cover per-generation caps and omitted defaults.
Unavailable provider usage stays unavailable. It must not count as zero tokens.

The common action pipeline charges completed operations after the backend returns. Pending and denied requests are not completed operations.
This accounting is not a concurrent reservation mechanism.
Direct PTY handlers do not use this operation budget.
VS Code tasks use a separate timeout range, so 120 seconds is not a universal shell deadline.
Main also contains normalized-name retry after a failed MCP call. A timeout alone does not prove no side effect occurred.

Result transport success, execution success, task success, and safety outcome require separate records:

- An SDK execution exception becomes an outer tool error that the model can receive and address.
- A built-in AUV nonzero exit raises an error with the original failure detail.
- An MCP `approval_required` response describes pending work. It does not mean execution occurred.
- Common-action denied and exception results set `isError=true`. Main retains the content, structured fields, and error flag that each handler supplies.
- The proxy returns that MCP object inside the SDK result. Its nested `isError` does not automatically become the SDK outer error flag.
- A shell timeout returns `exitCode=124` and `timedOut=true`. Outer action status can still be `executed`.
- Workflow paused or failed status does not always produce outer `isError`. Delegated browser failure has the same distinction.

[Stream event conversion](../../../packages/core-agent/src/runtime/xsai-events.ts) uses the SDK outer flag.
These distinctions are source findings, not new real-model failure claims.
Phase 4.1 must retain both result layers before a Phase 4.2 change receives consideration.
Phase 4.0 changes no budget, prompt, stop condition, or error contract.

## Evidence and current tests

The accepted Desktop manifest contains 88 files. The convergence manifest contains 99 files.
Every recorded byte count and SHA-256 matches on this audit pass.
Raw records, loaded bundles, identifiers, screenshots, commands, and evidence hashes remain outside Git.

The retained real Desktop runs used GLM-5.3-Flash, Electron `43.8.4`, and AUV `0.0.40`.
The original Desktop run identifies `daa6dfb3b`. The convergence run identifies `07993ffd4`, which added documentation only.
The convergence loaded Main bundle hash is `9d2a05ef365bb26760fe24e776ba66c82b9ee7d96472c6487ff148c832c52001`.
The reports identify normal Chat.send as the request entry.

Independent trace reconciliation matched all 11 model calls to exactly one Host request and the original session and turn.
The two visual trials contain six and five calls, with seven and five generated rounds.
Both final answers contain the independent Oracle nonce. Neither user prompt contains that nonce.
The native Oracle places the target window offscreen and unfocused.
The second trial retains an upstream native image block associated with its image-read tool call.

The first trial retains two failed target forms before a successful application capture.
One older whole-display Oracle was occluded. It does not establish complete display-content recognition.
Two visual trials provide bounded evidence, not a stable success-rate estimate.
No current-HEAD real-model replay occurred during Phase 4.0.
The [B2b diagnosis](phase3-b2b-environment-diagnosis.md) records process-context-dependent Input Desktop refusal, including read-only enumeration.
Historical Desktop success does not establish access for a fresh Host process.
If the actual Host cannot observe the fixture with existing safety checks, record an environment block and stop.

The external gateway fix preserves native image blocks in tool results.
Its normalized source hash is `fc645b84625a61d9f77d3e92ce1bad39a9249c7e64dda0295047e5b10ebc7697`.
The current external source matches that hash.
The [portable gateway tests](../../../scripts/gateway-tool-result/README.md) ran against isolated dummy credentials and a local fake upstream.
They passed 18 tests. They are protocol contract tests, not new model E2E.

| Current command, from repository root | Result | Boundary |
| --- | --- | --- |
| `pnpm -F @proj-airi/core-agent exec vitest run src/runtime src/messages --maxWorkers 2` | 226 passed | Controlled providers and runtime tests |
| `pnpm -F @proj-airi/stage-ui exec vitest run --project node src/stores/ai/chat-llm src/tools/mcp.test.ts src/stores/tool-call-rerun.test.ts --maxWorkers 2` | 79 passed | Tool resolution, forwarding, and attribution |
| `pnpm -F @proj-airi/stage-tamagotchi exec vitest run --project node src/main/services/airi/computer-use src/main/services/airi/mcp-servers src/renderer/stores/tools/built-in.test.ts src/renderer/stores/tools/mcp.test.ts scripts/phase3-harness/delivery-contract.test.ts --maxWorkers 2` | 182 passed, 1 skipped | Mock Electron and executors, plus retained native receipt checks |
| `pnpm -F @proj-airi/computer-use-mcp exec vitest run --config ./vitest.config.ts src/policy.test.ts src/config.test.ts src/server/execution-authorization.test.ts src/server/register-tools-pty-approval.test.ts src/server/register-pty-terminal-lane.test.ts src/server/tool-lane-hygiene.test.ts --maxWorkers 2` | 64 passed | Real in-memory MCP transport, mock native executors |
| `node --test --test-timeout=30000 scripts/gateway-tool-result/gateway-image.test.mjs` | 18 passed | Real local HTTP adapter, fake upstream |

For the Desktop command, `AIRI_PHASE3_EVIDENCE` identifies the preserved Phase 3-A receipt directory.
The sole skip is the opt-in live AUV smoke test. `AIRI_COMPUTER_USE_LIVE` stays unset.
The gateway command requires `GATEWAY_SOURCE` and an isolated `TEST_TMPDIR` as documented in its README.
All 551 selected Vitest tests passed. No real shell executor test ran.
`pnpm lint` passed with zero errors and 682 warnings, the same count as the retained convergence baseline.
The only repository addition is this document. It introduces no TypeScript warning.
Full lint output and the document-only diff accompany the local evidence receipt.

## Research evidence and invalid substitutes

The research source and records remain read-only.
The research Git SHA does not identify its untracked runners. The audit records file hashes separately.
The final preservation snapshot contains 32 new C4 research files that appeared during this audit.
All 288 original research files in the snapshot remain unchanged. The research HEAD is unchanged.
The audit neither ran nor assessed those C4 files. Their author and process provenance remain outside this audit.
The separate AUV source snapshot also remains unchanged.

| Research path | Observed implementation | Valid interpretation |
| --- | --- | --- |
| C1/C1.1 | Runtime tool registration and temporary HTTP shell bridge | Research behavior only, not production Terminal admission |
| C2 | Same shell bridge, dynamic tool injection, Runner approval probes | Qualified cross-service research, not a native approval E2E |
| C3 | Independent `generateText`, direct MCP client, `approvalMode=never`, custom tool wrapper | Independent executor experiment, not Stage Chat or a human-approval chain |

C3 configures `stepCountAtLeast(10)` in its own Runner. Current Core Agent does not use that condition.
Its six records contain four Oracle passes and two failures. Recorded call counts include 11 and 12.
Its `stepCount` counts tool calls, although its stop condition counts generated steps.
Its remaining-budget metric subtracts calls from ten and conflates these units.
Its wrapper defaults a missing backend exit code to zero and omits some MCP status fields.
Its command filter has a default-allow branch. Its queue does not establish a product-wide Terminal/GUI mutex.
These limits prevent transfer of its safety and budget claims to production.

C3 observation metrics match command prefixes and repeated command strings.
Its goal-retention metric copies the Oracle success bit.
These proxies do not establish information gain, contextual forgetting, or a need for Compact.
Phase 4 does not import that Runner or modify its historical records.

The following approaches invalidate a claimed native experiment:

- A temporary HTTP endpoint that runs model-supplied shell commands.
- Runtime `addTools`, `taskTools`, or manual `tool.execute()` as a replacement for production registration and model choice.
- Model self-approval, automatic approval probes, direct internal approval helpers, or a switch to `never`.
- A pre-fix gateway that converts image content to JSON text.
- Model answers, CLI exit zero, or Runner probe counts as the sole business Oracle.
- A clean socket handshake without a complete model, Host, image, and original-turn trace.

An isolated model protocol gateway differs from a shell Eval Bridge.
Its exact source and native image preservation remain prerequisites for the retained GLM route.
Several older smoke scripts still expect public self-approval in `actions` mode.
That expectation conflicts with `d3fc96c75`. Those scripts did not run here and cannot justify reopening self-approval.

## Capability and gap matrix

Each status applies only to the stated scope. A historical E2E status does not imply a new current-HEAD trial.

| Capability | Status | SHA and path | Oracle and limitation |
| --- | --- | --- | --- |
| Built-in autonomous read, image result, and continued Chat turn | Real E2E Verified | `daa6dfb3b` and documentation-only `07993ffd4`, normal Chat to Main AUV | Two visual trials, nonce and native Oracle, current replay pending |
| Disabled-request selection, session attribution, and queued cancellation | Real E2E Verified | `daa6dfb3b`, request closure and Host queue | Retained normal-Chat and direct-IPC cases, current controlled regression passed |
| Current Core loop and tool integration | Integrated | `28f0eaf14`, Core and Stage Resolver | Unchanged source trees and controlled tests, not a new real-model run |
| Independent MCP discovery and forwarding | Integrated | `28f0eaf14`, Renderer proxy to Main client | Source and in-memory tests, live Terminal attachment not established |
| Windows local shell execution | Integrated | Inherited Slice 1, MCP action executor to runner | Controlled policy tests, no trusted normal-Chat human approval E2E |
| Trusted Terminal human approval | Not Verified | `28f0eaf14`, adapter absent | Task C and Phase 4.4 Blocked |
| Main approval timing and cancellation | Integrated | `2d64bbc25`, unchanged at audited HEAD | Deterministic mock dispatch tests, no native write approval |
| C1/C1.1 recovery and qualified C2 collaboration | Research Verified | Research source hashes, injected Terminal path | Recorded business Oracles, historical qualifications remain in the convergence baseline |
| C3 independent model/MCP behavior | Research Verified | Research Runner and six record hashes | Four recorded Oracle passes, two failures, not a native Chat budget baseline |
| New A/B trials at audited HEAD | Not Verified | Planned normal Chat path | No Phase 4.1 experiment ran |
| GUI input and exact native target delivery | Not Verified | B2a/B2b research at `28f8adda8` and `28f0eaf14` | Production input remains NO-GO |

## Minimal Phase 4.1 plan and gate

Task A is ready for a bounded read-only trial after review.
The fixture paints a fresh nonce and shapes inside an independent window.
The discovery title uses a separate run identifier. Prompt text, window title, tool descriptors, and Runner arguments must exclude the answer.
The request selects Use computer through the existing Chat payload.
The model chooses discovery, capture, and image read. The Runner records those choices without supplying the sequence as executed calls.
An independent fixture Oracle compares the final answer with the painted state.

Task B uses an absent target, a mismatched title, or insufficient observation from the real fixture.
Each condition has a separate recorded Oracle.
Correct uncertainty or a justified stop counts as an acceptable safety outcome.
A claimed observation without evidence fails even after exit zero.
No automatic input, window activation, or real user application serves as a recovery step.

Task C is Blocked because normal production human approval is absent.
Phase 4.4 stays Blocked for the same reason.
An internal helper, direct MCP client, or research Runner cannot satisfy this prerequisite.

Before A/B, the reviewed run plan must include these prerequisites:

1. Build the recorded HEAD into a fresh isolated Desktop profile.
2. Record the loaded bundle, AUV binary, model identifier, parameters, protocol, and gateway hash.
3. Keep external MCP servers absent and record the actual resolved tool catalog.
4. Disable optional background tasks and external module connections through existing controls.
5. Use public Chat.send and existing request selection. Exclude tool injection and direct executor calls.
6. Keep the fixture offscreen or unfocused and retain independent pixels and internal state.
7. Record every generation, tool call, Host identity, complete result, error, usage report, and final transcript.
8. Join each tool call to the original conversation and independent Oracle.
9. Record `taskSuccess`, `observationSuccess`, `toolExecutionSuccess`, and `safetyOutcome` separately.

If the tool catalog or fixture cannot satisfy the read-only boundary, stop before the model request.

The trial plan must state a wall-clock observation limit and use the existing Chat Stop action.
Core has no hard call cap. A monitor threshold is not an execution budget.
Several read calls can start in one generated round. Dispatched reads can settle after Stop.
Record generated rounds, tool calls, token usage, elapsed time, repeated observations, and unchanged-result calls separately.
Keep model parameters, tools, prompts, and budgets fixed before a later comparison.

The source ancestry, current controlled tests, and intact historical read-only evidence support the bounded A/B recommendation.
This conclusion covers the ordinary model path with an isolated profile.
It does not assert compromised-Renderer containment, unrestricted MCP safety, or statistically stable model performance.
No permission or architecture change is necessary for this audit delivery.
Phase 4.1 requires its own reviewed experiment. This delivery stops here without remote publication.
