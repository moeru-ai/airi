# Kirie ablation review

Review dates: 2026-09-29 through 2026-09-30.
Historical experiment baseline: Kirie 0.6.5, Godot 4.7.2, macOS Metal Forward+.

This review analyzes framework boundaries, abstractions, ownership, and implementation methods.
It does not extend the [platform acceptance matrix](../MIGRATION.md#capability-matrix) or close Windows CEF shutdown.
The [immutable full review](https://github.com/BeanDz/airi/blob/ef7eb50e5a76265f2675e9072a7430d2dc46f09c/apps/stage-tamagotchi-kirie/docs/ablation-review.md) retains per-experiment logs and commands.

## Whole-framework decisions

The migration supplies a desktop host around an existing Vue application.
Its essential layers are the renderer, one transport owner, desktop capabilities, and AIRI application services.
A runtime choice inside every adapter adds no requirement to a Kirie-only application.

| Layer | Decision | Reason and boundary |
| --- | --- | --- |
| Original Electron application and Godot sidecar | Retain | Both remain supported. Their runtime requirements do not justify Electron fallback code inside Kirie-local adapters. |
| Kirie renderer host adapter | Specialize | One Kirie owner supplies a required Platform client and Eventa context. Remove runtime tags, optional Platform paths, and executable Electron alternatives. |
| Shared desktop UI contract | Retain | Existing shared UI still uses the `RUNTIME_ENVIRONMENT='electron'` build selector and Electron-named Eventa IDs. Names do not select an Electron transport. |
| Renderer bootstrap | Remove deferred startup | Server channel, character server bridge, plugins, Artistry, and MCP lack a supported Node runtime. Their initialization must not create unregistered requests or retry loops. |
| Plugin inspector | Expose unavailable state | No fake Kirie bridge advertises directory imports. Shared availability is false and unsupported operations retain explicit errors. |
| C# services and window managers | Retain domain ownership | Keyed Devtools, reusable Chat, latest Settings route, Spotlight hiding, and Notice completion have different behavior. Generic managers add branches and obscure ownership. |
| Lifecycle abstractions | Use Godot and caller ownership | Child exit and caller-owned registrations replace reverse registration sets and manual close callbacks. |
| Readiness, focus, and Notice state | Retain distinct state | A request before readiness differs from visibility. Focus grace periods protect native input. Notice must complete once before deletion. |
| Generic transformations | Use existing APIs | Godot selects the screen. .NET encodes Base64URL. Platform owns native commands. Forwarding helpers add no behavior. |
| Pointer implementation | Retain polling | The event prototype reduced requests but added state and code. Native inside-window state removes duplicate geometry without a new lifecycle. |
| Renderer source copy | Defer extraction | The audit counts 207 files, 168 Electron counterparts, 93 identical files, and 75 different counterparts. These counts describe overlap, not safe deletion. |
| CEF shutdown | Keep blocker open | Windows access violations and ObjectDB leaks remain. Source simplification and macOS exit code 0 do not establish safe teardown. |

The file counts describe the source audit at baseline `ef7eb50e5`, before this batch.
The renderer copy remains the largest duplication boundary.
Extraction requires ownership of shared entry points, routes, contracts, assets, build aliases, and platform-specific behavior.
A separate extraction design can compare the 75 different counterparts before consolidation.
Do not replace this work with a generated mirror or a broad conditional renderer.

The current batch specializes the adapter and removes unsupported bootstrap dependencies.
It removes the server-context bridge and character startup that depended on `ensureConnected`.
The leader's browser preload path then becomes reachable.
[Host architecture](host-architecture.md) records the resulting requirements.

The root typecheck includes Kirie. Root test commands do not run its local frontend suite or C# harness.
The local frontend suite covers host adapters and window context. Copied renderer tests outside that selection are not acceptance evidence.
[Current verification](verification.md#current-framework-batch) records the explicit batch commands and native coverage.

## Historical experiments 1–20

These rows retain the original experiment decisions.
Later single-host specialization supersedes the Kirie-local Electron alternatives described in experiment 17.
The table describes historical evidence, not new acceptance for the current batch.

| ID | Decision and removal | Strongest recorded evidence |
| --- | --- | --- |
| 1 | Retain direct `KirieNode/KirieCefWebView` lookup. Remove child search and invalid `KirieNode` focus fallback (36 lines). | Baseline and changed native first-open input, Escape hide, reopen, blur, and repeated-open focus passed. The pinned addon name and readiness order remain requirements. |
| 2 | Retain caller-owned Chat registrations. Remove `OpenBinding`, the reverse detach callback, and registration set (35 lines). | Native open, repeated open, title-bar close, and Spotlight reopen passed. The replacement Chat page initialized. Both exits reported four leaks. |
| 3 | Retain caller-owned Devtools bindings. Remove reverse ownership, registration set, and disposal loop (16 lines). | Main and Settings reused keyed windows, closed, and recreated them. Recreated Settings opened Main's Inspector. Both completed exits reported five leaks. |
| 4 | Retain `Window.Visible`. Remove duplicate `_userVisible` (three lines). | Native input, Escape, repeated hide, reopen, and Settings blur passed with one Spotlight target. Both exits reported three leaks. An unexplained baseline fullscreen interval was excluded. |
| 5 | Require the leader Inspector target. Remove first-page fallback (seven lines). | A new follower-only regression failed against the old selector and passed after removal. Live Main and Settings requests selected Main despite follower-first target order. |
| 6 | Remove duplicate `_closing` in Chat, Settings, Onboarding, and Developer windows (28 lines). | All four native windows closed and reopened. Quit with Devtools returned code 0 and nine leaks. Notice retained its completion guard. |
| 7 | Remove Auth's caller-registration collection (nine lines). Retain binding and generation guards. | Temporary real-Eventa baseline/changed probes covered queued errors, caller disposal, registration reuse, and logout invalidation. They did not exercise active browser login. |
| 8 | Replace six manual window-close callbacks with `TreeExiting` (21 lines). Retain identity checks. | Native reopen and Notice true/false flows passed. Spotlight reused one target. Quit with six window types reported 13 leaks and existing disposed-renderer errors. |
| 9 | Use `string.Join`. Remove `FormatModifiers` (five lines) and a standard-library assertion (four test lines). | Existing policy tests and build checks passed. The UI persistence flow was not repeated. |
| 10 | Use `DisplayServer.GetScreenFromRect`. Remove the screen selector (27 lines) and its tests (ten lines). | A temporary native probe compared 20 boundary and off-screen points without mismatch. Spotlight reused one target. Quit reported two leaks. |
| 11 | Return selected topmost and centering commands directly (18 lines). | Existing window-action tests passed. Platform captures invokes without `this`. No additional native acceptance followed. |
| 12 | **Withdraw event-driven pointer observation.** Retain the original polling, retry, and DPI behavior. | The prototype reduced stationary requests from 41 per second to zero, but added 26 production lines and lifecycle state. That reduction is not current behavior. |
| 13 | Read Platform from the existing owner. Remove its forwarding getter (three lines). | Source review preserved the owner in delayed notifications instead of recreating one after disposal. No new native acceptance followed. |
| 14 | Trust existing inside-window state. Remove cached bounds comparison (six lines). | A temporary browser reproduction failed before removal and passed afterward with cached width 800, x=900, and native `inside=true`. Subsequent false state also passed. |
| 15 | Return Kirie pointer passthrough directly. Remove boolean forwarding. | Two temporary real-Platform/Eventa cases passed before and after removal for true, false, and host rejection. Native click-through was not exercised. |
| 16 | Reuse the parsed HTTP(S) URL. Remove duplicate parsing. | Six temporary Chromium cases passed before and after removal for routing, schemes, host rejection, and disposal. OS browser launch remained mocked. |
| 17 | Return four existing Electron invokes directly. Remove command-only wrappers. | Four temporary real-Eventa cases passed before and after removal for argument shape and rejection. Native Electron quit, login, and shortcuts were not exercised. |
| 18 | Use .NET `Base64Url.EncodeToString`. Remove manual substitutions. | A temporary real-Eventa PKCE probe passed 16 rounds before and after replacement. It covered state rejection, missing code, callback delivery, and logout listener cancellation. |
| 19 | Let child exit clear Devtools windows. Remove manager close/clear during disposal. | Two native runs opened two keys, reused one, and quit. Both disposal diagnostics reported zero tracked windows, exit code 0, and three leaks. |
| 20 | Let child exit clear Spotlight and Notice references. Remove manager close during disposal. | Two native runs reused Spotlight and quit with a pending Notice. Diagnostics reported false completion and null references. Both exits reported three leaks. |

Experiment 5 retains its meaningful regression case.
All other added probes and diagnostics remained temporary and were removed.
Experiments 9 and 10 removed tests for deleted helpers. Existing behavior tests remain.
Temporary frontend counts were 44 for experiment 15, 48 for 16, and 46 for 17.
Each count included the historical 42 existing tests.

## Why the retained design works

Godot exits children before their parent.
`TreeExiting` follows the child's `_ExitTree` and precedes parent disposal.
`TreeExited` runs too late for that ownership sequence.
See the [pinned Godot lifecycle](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/node.cpp).

Repeated `Hide()` and `QueueFree()` add no separate close-state requirement.
Notice differs because cancellation and completion callbacks can occur before deletion.
See [Window implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/window.cpp)
and [queue_free contract](https://docs.godotengine.org/en/stable/classes/class_node.html#class-node-method-queue-free).

The [pinned Platform client](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/platform/src/index.ts) captures invokes without `this`.
Its [native host](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/GdKirie.Platform/src/GdKiriePlatformHost.cs) uses the current window size for pointer-inside state.
Godot's [screen selection](https://github.com/godotengine/godot/blob/4.7.2-stable/servers/display/display_server.cpp) supplies the existing rectangle algorithm.
.NET 10 supplies [Base64URL encoding](https://learn.microsoft.com/en-us/dotnet/api/system.buffers.text.base64url.encodetostring?view=net-10.0).
The temporary authentication probe compared its verifier and challenge against [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636).

## Historical command results

These commands describe the earlier experiment batches, before the current framework specialization.

| Command | Recorded result |
| --- | --- |
| `mise x -- dotnet build StageTamagotchiKirie.csproj --no-restore` | Passed after probe removal, with no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Passed after probe removal. Experiment 5's new case failed on the old selector first. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Passed. Both project format checks also passed in the relevant earlier batches. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed after probe removal: 13 files and 42 existing tests. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed after probe removal. |
| `mise x -- pnpm typecheck` | Review batch passed all 54 tasks. |
| `mise x -- pnpm exec moeru-lint <changed documentation and host adapters>` | Passed for the recorded changed files. The immutable full review retains the exact file arguments. |
| `mise x -- pnpm lint` | Failed with 1,715 errors and 701 warnings. All errors were in 23 ignored artifact files. |
| `git diff --check` | Passed in the recorded batches. |

Experiments 15–20 removed 37 production lines overall. The earlier frontend review retained a 27-line reduction.
Normal restore resolved stale GodotSharp 4.7.1 assets in experiments 2 and the cursor review.
No package or dependency configuration workaround was added.
One comment-only format run reported a workspace-load warning. Later explicit-project format checks passed.
Independent source review found no defect in the retained experiments.
That review covered desktop plumbing, not every migrated framework or capability.

## Resize cursor indicators (2026-09-30)

Main forwards `Node._Input` to the existing native resize controller.
Edge motion sets the horizontal, vertical, or diagonal cursor, then consumes the event.
Interior motion remains available to the WebView's hand or text cursor.
Edge detection, DPI scaling, native resize, and cursor cleanup remain unchanged.

The previous `WindowInput` callback set the cursor before GUI input.
The hovered Control replaced it during the same event.
See [Window input dispatch](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/window.cpp#L2020)
and [Viewport processing](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/viewport.cpp#L3502).

A temporary macOS probe loaded Main and added a Control with hand and text cursors.
All eight directions retained their cursor through the next frame.
Interior motion, window exit, and disabled resizing restored the Control cursor.
All 28 assertions passed. The probe added no permanent test.
C# build, tests, and format checks passed. Native exit returned code 0 with two leaks.
Root lint retained the recorded artifact failures. Windows cursor review remains pending.

## Coverage and blockers

Historical native experiments used macOS Metal Forward+.
They do not establish Windows shutdown, physical shortcuts, physical close buttons, native click-through, or mixed-DPI behavior.
The single-display screen probe does not cover multiple displays or Wayland.
The PKCE probe does not establish system-browser launch, account sign-in, or token exchange.

Exit code 0 occurred alongside ObjectDB leak counts from one to 13.
Disposed-renderer rejections and deferred-service errors also occurred.
The Windows crash remains a migration blocker. These observations require lifecycle investigation rather than a generic cleanup abstraction.
Pending checks and deferred reopen conditions remain in [MIGRATION.md](../MIGRATION.md#remaining-acceptance-work).

The current adapter and bootstrap batch has different source and frontend test counts.
Its results belong to [current framework verification](verification.md#current-framework-batch), not the historical rows.
