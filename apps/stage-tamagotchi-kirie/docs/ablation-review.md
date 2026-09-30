# Kirie ablation review

Review dates: 2026-09-29 through 2026-09-30. Baseline: Kirie 0.6.5, Godot 4.7.2, macOS Metal Forward+.

This document retains experiment results, source references, commands, and coverage limits.
These checks do not extend the [platform acceptance matrix](../MIGRATION.md#capability-matrix) or close its Windows exit failure.
The [platform verification record](verification.md) contains the earlier migration acceptance evidence.

Migration ablation removes designs that add no required behavior.
Use temporary probes and existing checks to compare behavior. Do not add permanent tests by default for this migration review.
If a change does not simplify the final design, discard it.

## Experiment index

| Experiment | Result | Evidence |
| --- | --- | --- |
| 1 | Retained | [Spotlight CEF lookup](#ablation-1-spotlight-cef-lookup-2026-09-29) |
| 2 | Retained | [Chat registration ownership](#ablation-2-chat-registration-ownership-2026-09-29) |
| 3 | Retained | [Devtools registration ownership](#ablation-3-devtools-registration-ownership-2026-09-29) |
| 4 | Retained | [Spotlight visibility state](#ablation-4-spotlight-visibility-state-2026-09-30) |
| 5 | Retained | [Inspector target fallback](#ablation-5-inspector-target-fallback-2026-09-30) |
| 6 | Retained | [Duplicate window close state](#ablation-6-duplicate-window-close-state-2026-09-30) |
| 7 | Retained | [Authentication registration ownership](#ablation-7-authentication-registration-ownership-2026-09-30) |
| 8 | Retained | [Native window exit notifications](#ablation-8-native-window-exit-notifications-2026-09-30) |
| 9 | Retained | [Shortcut formatting wrapper](#ablation-9-shortcut-formatting-wrapper-2026-09-30) |
| 10 | Retained | [Native screen selection](#ablation-10-native-screen-selection-2026-09-30) |
| 11 | Retained | [Window action forwarding wrappers](#ablation-11-window-action-forwarding-wrappers-2026-09-30) |
| 12 | Withdrawn | [Native pointer observation, withdrawn](#ablation-12-native-pointer-observation-withdrawn-2026-09-30) |
| 13 | Retained | [Platform getter](#ablation-13-platform-getter-2026-09-30) |
| 14 | Retained | [Duplicate pointer-inside geometry](#ablation-14-duplicate-pointer-inside-geometry-2026-09-30) |
| 15 | Retained | [Pointer passthrough forwarding](#ablation-15-pointer-passthrough-forwarding-2026-09-30) |
| 16 | Retained | [Duplicate external URL parsing](#ablation-16-duplicate-external-url-parsing-2026-09-30) |
| 17 | Retained | [Electron command forwarding](#ablation-17-electron-command-forwarding-2026-09-30) |
| 18 | Retained | [Base64URL encoding](#ablation-18-base64url-encoding-2026-09-30) |
| 19 | Retained | [Developer window exit ownership](#ablation-19-developer-window-exit-ownership-2026-09-30) |
| 20 | Retained | [Spotlight and notice exit ownership](#ablation-20-spotlight-and-notice-exit-ownership-2026-09-30) |

## Experiments

### Ablation 1: Spotlight CEF lookup (2026-09-29)

The experiment removed `SpotlightWindow.FindCefControl` and its search through arbitrary child controls.
The final fallback returned `KirieNode`, which cannot forward focus to the CEF document.

The pinned [Kirie backend](../addons/kirie/gd_kirie.gd) names the control `KirieCefWebView` and adds it before `WebViewReady`.
The [Kirie node](../addons/kirie/kirie_node.gd) supplies itself as the parent.
[SpotlightWindow](../src-godot/scripts/SpotlightWindow.cs) now reads `KirieNode/KirieCefWebView` directly after readiness.
It retains `FocusMode` and `GrabFocus`. The source change removes 36 lines overall.

The macOS experiment used Godot 4.7.2, Kirie 0.6.5, and Metal Forward+.
The baseline and changed builds both focused the input on first open and received native text input without a click.
After the change, Escape hid Spotlight. Reopening restored focus and accepted the native input `test`.
Opening Settings moved focus away and changed Spotlight's native state to `visible=false` and `focused=false`.
Two further open requests reused the same CEF page and restored both document and native focus.

Open requests used the existing Eventa contract. This experiment does not establish global-shortcut or Windows acceptance.
The direct lookup depends on the pinned addon node name. An addon upgrade requires another check of that name and readiness order.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build --no-restore` | Passed before and after the change, with no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Passed. |
| `mise x -- dotnet format --verify-no-changes --no-restore` | Exited 0. The comment-only rerun reported a workspace load warning. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 tests. |
| `mise x -- pnpm lint` | Failed with 1,715 errors and 701 warnings. All errors were in 23 Git-ignored artifact files. |
| `git diff --check` | Passed. |

The lint errors came from native addon artifacts, previous `.auv` captures, and generated C# output.
This experiment retains the simpler lookup and does not change the capability matrix.

### Ablation 2: Chat registration ownership (2026-09-29)

The experiment removed `ChatWindowManager.OpenBinding`, its registration set, and the reverse `Detach` callback.
[ChatWindowManager](../src-godot/scripts/ChatWindowManager.cs) now retains its main registration and returns Eventa registrations directly from `Attach`.
The source change removes 35 lines overall.

[SpotlightWindow](../src-godot/scripts/SpotlightWindow.cs) already owns its Chat registration and disposes it before its Eventa context.
Spotlight is a child of Main. Godot runs a parent's `_ExitTree` after its children leave the tree.
See the [Godot lifecycle contract](https://docs.godotengine.org/en/stable/classes/class_node.html#class-node-private-method-exit-tree).
Thus, Spotlight releases its registration before Main disposes the Chat manager.
The removed registration set added no cleanup to this ownership sequence.

The baseline and changed builds ran on macOS with Godot 4.7.2, Kirie 0.6.5, and Metal Forward+.
Both builds passed main-window open, repeated open, native title-bar close, and reopen from the hidden Spotlight renderer.
After the change, two Spotlight requests reused one replacement Chat page.
That page completed initialization, displayed its input controls, and had no route error.
Both application exits returned code 0 and reported the same four leaked ObjectDB instances.
These checks do not establish notification delivery or Windows acceptance.

Initial `--no-restore` checks failed with `NU1605` because local generated assets selected GodotSharp 4.7.1.
The normal build and test commands restored the pinned 4.7.2 dependencies without configuration changes.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build` | Passed after restoring the project assets. |
| `mise x -- dotnet build --no-restore` | Passed after the change and after format verification, with no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests` | Passed after restoring the test assets. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Passed without workspace warnings. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 tests. |
| `mise x -- pnpm lint` | Failed with the same 1,715 errors and 701 warnings as ablation 1. |
| `mise x -- pnpm exec moeru-lint apps/stage-tamagotchi-kirie/MIGRATION.md` | Passed. |
| `git diff --check` | Passed. |

This experiment retains direct registration ownership and does not change the capability matrix.

### Ablation 3: Devtools registration ownership (2026-09-29)

The experiment removed the registration set, disposal loop, and reverse `Detach` callback from [DeveloperToolsService](../src-godot/scripts/developer-tools-service.cs).
It also removed the reverse owner field from `Binding`.
The source change removes 16 lines overall and adds no replacement abstraction.
`Binding` still owns both handler registrations and retains its disposal guard and release order.

[Main](../src-godot/scripts/Main.cs) releases its registration before the service.
[SettingsWindow](../src-godot/scripts/SettingsWindow.cs) releases its registration before its Eventa context.
Settings is a child of Main. Godot calls the parent's `_ExitTree` after its children leave the tree.
See the [Godot lifecycle contract](https://docs.godotengine.org/en/stable/classes/class_node.html#class-node-private-method-exit-tree).
These are the only attachment sites, so the removed set was empty at normal service disposal.
Inspector cancellation, HTTP disposal, and developer-window ownership remain unchanged.

The baseline and changed builds ran on macOS with Godot 4.7.2, Kirie 0.6.5, and Metal Forward+.
Both builds passed repeated Devtools requests from Main and Settings, Settings close and reopen, and Devtools close and recreation.
Two requests with the same key reused one window, including after recreation.
Baseline Inspector requests passed from Main and Settings.
After the change, an Inspector request from the recreated Settings window opened the main renderer's target.
The changed build did not repeat the Inspector request from Main.

Both completed shutdown checks returned code 0 with Settings and Devtools open.
The baseline used the application quit adapter. The changed build used the native application menu.
Both reported five leaked ObjectDB instances and the existing GAP-010 requests for the deferred server channel.
Interrupted CDP runs were excluded from shutdown evidence. These checks do not establish Windows acceptance.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build --no-restore` | Passed before and after the change, with no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Passed. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 tests. |
| `mise x -- pnpm lint` | Failed with the same 1,715 errors and 701 warnings as ablation 2. |
| `mise x -- pnpm exec moeru-lint apps/stage-tamagotchi-kirie/MIGRATION.md` | Passed. |
| `git diff --check` | Passed. |

This experiment retains caller-owned registrations and does not change the capability matrix.

### Ablation 4: Spotlight visibility state (2026-09-30)

The experiment removed `_userVisible` and its two assignments from [SpotlightWindow](../src-godot/scripts/SpotlightWindow.cs).
Both focus guards now read the inherited `Window.Visible` property.
The source change removes three lines overall and adds no replacement abstraction.

The scene starts hidden. Its show and hide methods were the only writers of the removed field.
Godot updates its visibility value before native window operations and visibility callbacks.
See the [Godot 4.7.2 implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/window.cpp#L892-L1029).
Thus, the focus guards retain the same visibility check without a second state value.
`_showRequested` remains separate because it records a request before the WebView is ready.
Readiness, the two-frame focus grace period, deferred focus checks, CEF input focus, and transparency operations remain unchanged.

The baseline and changed builds ran on macOS with Godot 4.7.2, Kirie 0.6.5, and Metal Forward+.
Both builds accepted native keyboard input and passed repeated open, Escape hide, repeated hide, and hide followed by reopen.
Opening Settings in normal window mode hid Spotlight after focus loss. Reopening Spotlight restored its focus.
Each build retained one Spotlight CEF target throughout these operations.
The changed build also accepted native input on its first open.

During the baseline run, Settings entered native fullscreen mode for an unconfirmed reason.
That interval was excluded from focus evidence. The window returned to normal mode before the focus checks were repeated.
Settings stayed in normal window mode during the changed run.
These checks do not establish native close-request handling, global-shortcut delivery, or Windows acceptance.

Both application quit requests returned process code 0 with Spotlight and Settings open.
Both runs reported three leaked ObjectDB instances and the existing unregistered requests for deferred migration capabilities.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build --no-restore` | Passed before and after the change, with no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Passed. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 tests. |
| `mise x -- pnpm lint` | Failed with the same 1,715 errors and 701 warnings as ablation 3. |
| `mise x -- pnpm exec moeru-lint apps/stage-tamagotchi-kirie/MIGRATION.md` | Passed. |
| `git diff --check` | Passed. |

This experiment retains `Window.Visible` as the visibility source and does not change the capability matrix.

### Ablation 5: Inspector target fallback (2026-09-30)

The experiment removed the first-page fallback from [CefInspectorTarget](../src-godot/scripts/cef-inspector-target.cs).
The selector now requires a leader page with an HTTP or HTTPS Inspector URL.
If that target is absent, it throws `InvalidDataException` instead of opening a follower's Inspector.
The source change removes seven production lines overall and adds no replacement abstraction.

The [CDP discovery endpoint](https://chromedevtools.github.io/devtools-protocol/index.html#http-endpoints) lists available targets.
[RendererUrl.ForMain](../src-godot/scripts/RendererUrl.cs) establishes `synced-leader=true` before Main creates its WebView.
Auxiliary windows receive `synced-leader=false`. Target order does not identify the main window.
The removed fallback had no supported startup caller before the main page loaded.

Page-type filtering, query matching, and Inspector URL validation remain unchanged.
The target page can still use `res://`. The HTTP or HTTPS requirement applies only to its Inspector URL.

The original C# suite passed before the change.
A new follower-only case failed against the old selector because it returned the follower's Inspector.
The retained cases cover follower-only rejection, follower-before-leader ordering, and worker exclusion.
The missing-leader case uses constructed JSON, not a reproduced native failure.

The changed build ran on macOS with Godot 4.7.2, Kirie 0.6.5, and Metal Forward+.
The live target list placed Chat and Settings before Main.
Inspector requests from Settings and Main both opened the main renderer's target in Chrome.
The Main request completed after a delayed CDP tab switch. This check does not establish connection latency.

Native application quit returned process code 0 and reported three leaked ObjectDB instances.
The log still contained requests for deferred migration capabilities. These checks do not establish Windows acceptance.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build --no-restore` | Passed before and after the change, with no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Baseline passed. The new regression case failed before removal. The complete suite passed after removal. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Passed. |
| `mise x -- dotnet format tests/StageTamagotchiKirie.Tests/StageTamagotchiKirie.Tests.csproj --verify-no-changes --no-restore` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 tests. |
| `mise x -- pnpm lint` | Failed with the same 1,715 errors and 701 warnings as ablation 4. |
| `mise x -- pnpm exec moeru-lint apps/stage-tamagotchi-kirie/MIGRATION.md` | Passed. |
| `git diff --check` | Passed. |

This experiment retains explicit main-page selection and does not change the capability matrix.

### Ablation 6: Duplicate window close state (2026-09-30)

Chat, Settings, Onboarding, and Developer windows no longer store `_closing`. This removes 28 production lines.
Their close methods clear `_showRequested`, hide the window, and queue deletion.
Godot [ignores repeated hiding](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/window.cpp)
and [supports repeated `queue_free()` calls](https://docs.godotengine.org/en/stable/classes/class_node.html#class-node-method-queue-free).
Notice retains its guard because completion and cancellation callbacks can run before deletion.

On macOS, all four windows closed and reopened. Application quit with Devtools open returned code 0 and reported nine leaked ObjectDB instances.
Deferred capability errors remained in the log. No Windows acceptance or new permanent tests were added.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build --no-restore` | Passed, no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Passed before and after removal. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 tests. |
| `mise x -- pnpm lint` | Failed with the existing 1,715 errors and 701 warnings. |

### Ablation 7: Authentication registration ownership (2026-09-30)

[AuthService](../src-godot/scripts/auth-service.cs) no longer tracks caller-owned registrations. This removes nine production lines.
Main, Settings, and Onboarding already dispose their registrations before the service or their Eventa context exits.
Login cancellation on caller disposal, active-binding checks, and generation checks remain unchanged.

A temporary real-Eventa probe passed before and after removal without browser, network, or account access.
It covered queued errors, caller disposal, registration reuse, and logout invalidation. It does not establish active browser-login cancellation.
The build, C# tests, format check, typecheck, and 42 frontend tests passed again with the commands listed under ablation 6.
Root lint retained 1,715 errors and 701 warnings. No permanent tests were added.

### Ablation 8: Native window exit notifications (2026-09-30)

Six window classes no longer accept, store, or invoke a manual close callback. This removes 21 production lines overall.
Managers use `TreeExiting` and retain identity checks before clearing their current window.
Godot emits this signal after each window's `_ExitTree`, before its parent exits.
`TreeExited` runs later during shutdown and does not preserve this order. See the [pinned lifecycle implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/node.cpp).

On macOS, Chat, Settings, Onboarding, and Devtools closed and reopened. Notice close returned `false`, and confirmation returned `true` after recreation.
Spotlight hid and reopened with the same CEF target. Application quit with all six window types present returned code 0 and reported 13 ObjectDB leaks.
Existing deferred capability and disposed-renderer errors remained. These checks do not establish Windows acceptance or resolve those errors.
The build, C# tests, format check, typecheck, and 42 frontend tests passed with the commands listed under ablation 6.
Root lint retained 1,715 errors and 701 warnings. No permanent tests were added.

### Ablation 9: Shortcut formatting wrapper (2026-09-30)

Shortcut persistence now calls `string.Join` directly. The single-use `FormatModifiers` wrapper added no application behavior.
This removes five production lines and a four-line assertion of standard-library behavior. Shortcut parsing and policy tests remain.
The build, C# tests, format checks, typecheck, and 42 frontend tests passed with the commands listed under ablation 6.
The test project also passed `dotnet format --verify-no-changes --no-restore`. The temporary authentication probe passed again.
Root lint retained 1,715 errors and 701 warnings. No permanent test was added.
The shortcut persistence flow was not repeated through the UI.

### Ablation 10: Native screen selection (2026-09-30)

Spotlight now uses `DisplayServer.GetScreenFromRect` with a one-pixel rectangle at the cursor. The current-screen fallback remains.
This removes 27 production lines and ten test lines for the deleted selector. Scaling, decorations, and usable-area placement remain unchanged.
Godot uses the same rectangle for cursor-screen lookup. Its [pinned implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/servers/display/display_server.cpp) retains the first matching screen.

A temporary native Godot probe compared both algorithms at 20 points on the available macOS display, with no mismatch.
The points covered the center, boundaries, negative coordinates, and positions outside the display.
Spotlight opened, hid, and reopened with the same CEF target at `(1034, 576, 1440, 200)`. Application quit returned code 0 with two ObjectDB leaks.
The build, C# tests, both project format checks, typecheck, and 42 frontend tests passed with the commands listed under ablations 6 and 9.
Root lint retained 1,715 errors and 701 warnings. These checks do not establish multiple-display, Windows, or Wayland runtime acceptance.

This completes the confirmed C# candidates in this review, not an audit of all Kirie features.
Broadcast registries, readiness state, cancellation guards, and native focus protection retain distinct requirements and remain unchanged.

### Ablation 11: Window action forwarding wrappers (2026-09-30)

Always-on-top and centering return their selected host functions directly. This removes 18 production lines.
The [Platform implementation](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/platform/src/index.ts) captures its invokes without `this`.
Existing window-action tests remain. Additional forwarding-only tests were removed because the change adds no behavior.

### Ablation 12: Native pointer observation, withdrawn (2026-09-30)

The event experiment reduced stationary pointer requests from 41 per second to zero, but added 26 production lines and more lifecycle state.
The review withdrew it because it did not simplify the design. The application retains its original polling, retry, and DPI behavior.
The event-specific tests and DPR configuration were also removed. The zero-request result does not describe the current implementation.

### Ablation 13: Platform getter (2026-09-30)

Entry points now read Platform from their existing owner. Removing the forwarding getter saves three production lines overall.
Delayed notification callbacks retain that owner instead of initializing another owner after disposal.

### Ablation 14: Duplicate pointer-inside geometry (2026-09-30)

The composable now uses the existing inside-window state. This removes six production lines.
Electron already computes this state. Kirie's [native host](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/GdKirie.Platform/src/GdKiriePlatformHost.cs) uses the current window size.
A temporary browser reproduction establishes cached width 800, then receives x=900 with `inside=true` on the next pointer poll.
The original implementation failed this assertion. The simpler implementation passes and also handles a subsequent `inside=false` response.
The review removed the temporary test after verification. No permanent regression test was added for this migration change.

### Ablation 15: Pointer passthrough forwarding (2026-09-30)

The Kirie pointer adapter now returns the Platform command directly. Its wrapper forwarded one boolean without transformation.
The pinned [Platform implementation](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/platform/src/index.ts) captures its invokes without `this`.
The Electron adapter retains its wrapper because it adds the required `{ forward: true }` argument.

A temporary probe used the real Platform client and in-process Eventa handlers.
Both baseline and changed adapters sent `true` and `false` and propagated a host rejection. Both probe cases passed.
The complete frontend run passed 44 tests: 42 existing tests and the two temporary cases.
The temporary probe initially lacked transport option types. The corrected probe and application typecheck passed.
The review removed the probe after verification. No permanent test was added.
These checks do not establish native click-through, physical pointer, or Windows acceptance.

| Command | Result |
| --- | --- |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie exec vitest run --config vitest.config.ts --project node src-web/src/renderer/host-context/pointer-ablation.test.ts` | Baseline passed, two temporary cases. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Changed adapter passed, 44 tests including the probe. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed after the temporary probe type correction. |
| `mise x -- pnpm exec moeru-lint apps/stage-tamagotchi-kirie/src-web/src/renderer/host-context/pointer.ts` | Passed. |

### Ablation 16: Duplicate external URL parsing (2026-09-30)

The `window.open` interceptor now uses its already parsed HTTP(S) URL for the Platform request.
The deleted helper parsed the same input again and returned a boolean that repeated the scheme decision.
Scheme, origin, target, error handling, and cleanup policies remain unchanged. Link clicks retain their existing handler.

A temporary Chromium probe covered foreign-origin `_self`, same-origin `_blank`, same-origin `_self`, non-HTTP schemes, and empty requests.
It also covered host rejection logging and restoration of `window.open` on disposal. All six cases passed before and after removal.
The complete frontend run passed 48 tests: 42 existing tests and six temporary cases.
The review removed the probe after verification. No permanent test was added.
These checks cover browser routing with a mocked operating-system boundary. They do not establish native browser launch or Windows acceptance.

| Command | Result |
| --- | --- |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie exec vitest run --config vitest.config.ts --project browser src-web/src/renderer/host-context/external-navigation-ablation.browser.test.ts` | Baseline passed, six temporary cases. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Changed interceptor passed, 48 tests including the probe. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm exec moeru-lint apps/stage-tamagotchi-kirie/src-web/src/renderer/host-context/external-navigation.ts` | Passed. |

### Ablation 17: Electron command forwarding (2026-09-30)

Electron quit, login, logout, and shortcut `unregisterAll` now return their existing Eventa invokes directly.
Their [source contracts](../src-web/src/shared/eventa/index.ts) explicitly return `void`. The deleted wrappers added no parameters, policy, or error boundary.
The audited callers invoke these commands without arguments. The quit click handler also invokes its command without the mouse event.
Kirie keeps its explicit empty payloads and authentication configuration sequence.
Chat and onboarding retain their wrappers because their response contracts do not explicitly return `void`.

A temporary real-Eventa probe covered parameterless requests and rejection propagation for all four commands.
All four cases passed before and after removal. The complete frontend run passed 46 tests, including the temporary cases.
The review removed the probe after verification. No permanent test was added.
These checks do not establish native Electron quit, login, or physical shortcut acceptance.

| Command | Result |
| --- | --- |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie exec vitest run --config vitest.config.ts --project node src-web/src/renderer/host-context/electron-commands-ablation.test.ts` | Baseline passed, four temporary cases. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Changed adapters passed, 46 tests including the probe. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm exec moeru-lint apps/stage-tamagotchi-kirie/src-web/src/renderer/host-context/app.ts apps/stage-tamagotchi-kirie/src-web/src/renderer/host-context/auth.ts apps/stage-tamagotchi-kirie/src-web/src/renderer/host-context/global-shortcuts.ts` | Passed. |

### Ablation 18: Base64URL encoding (2026-09-30)

Authentication now uses .NET's [Base64Url.EncodeToString](https://learn.microsoft.com/en-us/dotnet/api/system.buffers.text.base64url.encodetostring?view=net-10.0).
The deleted helper manually removed padding and replaced two characters. The application already targets .NET 10, so no dependency changed.
Secret entropy, PKCE hashing, authorization URL construction, and callback ownership remain unchanged.

A temporary checkpoint captured the application's verifier, authorization URL, and loopback listener before browser launch.
The probe used real Eventa configure, login, and logout handlers. It checked PKCE against an independent encoding of the generated verifier.
It also checked relay state, forged-state rejection, missing-code rejection, callback delivery, and listener cancellation after logout.
All 16 rounds passed before and after replacement. The [PKCE specification](https://www.rfc-editor.org/rfc/rfc7636) defines the checked verifier and challenge requirements.
The checkpoint and probe stayed temporary. No test API or permanent test remains in the application.
These checks do not establish system-browser launch, account sign-in, or token exchange.

| Command | Result |
| --- | --- |
| `mise x -- dotnet run --project /tmp/airi-kirie-auth-pkce-probe/StageTamagotchiKirie.Tests.csproj --no-restore` | Baseline and changed implementations passed 16 rounds each. The probe path is local temporary evidence. |
| `mise x -- dotnet build StageTamagotchiKirie.csproj --no-restore` | Passed after checkpoint removal, no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Passed after checkpoint removal. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Passed after checkpoint removal. |

### Ablation 19: Developer window exit ownership (2026-09-30)

The developer-tools service no longer closes or clears its windows during disposal. `DeveloperWindow.RequestClose` is now private.
Main owns every tracked window as a child. Main's exit callback is the only service disposal caller.
Godot [exits children before their parent](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/node.cpp#L390-L398).
Each child's `TreeExiting` callback removes its dictionary entry before Main disposes the service.
The service retains its disposal guard and HTTP client cleanup. Windows retain their own close handler and WebView cleanup.

Both macOS native runs opened two keyed developer windows through the real renderer Eventa adapter.
Reopening the first key retained two developer pages. The runs then invoked the main renderer's application quit command.
A temporary diagnostic reported zero tracked windows at service disposal before and after removal. Both development processes exited with code 0.
Both runs reported three leaked ObjectDB instances. Background requests for deferred host features also produced unregistered Eventa errors.
The diagnostic was removed after verification. No permanent test or diagnostic remains.
These checks cover macOS application exit with open developer windows. They do not establish Windows exit or physical close-button acceptance.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build StageTamagotchiKirie.csproj --no-restore` | Baseline and changed instrumented builds passed, no warnings or errors. |
| `mise x -- pnpm kirie dev` | Baseline and changed native runs exited with code 0. |
| `agent-browser --session airi-ablation19 --cdp 9229 eval --stdin` | Baseline opened two keys and reused the first key. Main quit produced `ablation-devtools-dispose-count=0`. |
| `agent-browser --session airi-ablation19-changed --cdp 9229 eval --stdin` | Changed run repeated the same sequence and produced `ablation-devtools-dispose-count=0`. |

### Ablation 20: Spotlight and notice exit ownership (2026-09-30)

Spotlight and notice managers no longer close their child windows during manager disposal. `NoticeWindow.CloseWithoutAction` is now private.
Main is the only manager owner and disposal caller. Both managers add their windows as Main children.
Their `TreeExiting` callbacks clear window references before Main disposes either manager. This follows the Godot exit order checked in experiment 19.
Spotlight retains its Eventa registration cleanup. Notice retains cancellation, its completion guard, and exit-time completion with `false`.

Both macOS native runs opened Spotlight twice and opened one notice without answering it.
Each run retained one Spotlight page and one notice page, then invoked the main renderer's application quit command.
Temporary diagnostics confirmed notice completion with `false` and null window references at both manager disposal boundaries.
Baseline and changed processes exited with code 0. Both reported three leaked ObjectDB instances and background errors for deferred host features.
The diagnostics were removed after verification. No permanent test or diagnostic remains.
These checks cover native teardown and host completion. They do not establish notice delivery after renderer teardown or physical close-button acceptance.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build StageTamagotchiKirie.csproj --no-restore` | Baseline and changed instrumented builds passed, no warnings or errors. |
| `mise x -- pnpm kirie dev` | Baseline and changed native runs exited with code 0. |
| `agent-browser --session airi-ablation20 --cdp 9229 eval --stdin` | Baseline reused Spotlight and opened a pending notice. Quit produced completion `False` and two null window references. |
| `agent-browser --session airi-ablation20-changed --cdp 9229 eval --stdin` | Changed run repeated the sequence with the same completion and disposal results. |

### Batch verification: Experiments 15–20 (2026-09-30)

The retained changes remove 37 production lines overall. All temporary probes and production checkpoints were removed.
An independent source review found no defects in the retained changes. No further strong candidate remained in the reviewed desktop host plumbing.
Model rendering, assets, and media remained outside this review. Windows and physical input acceptance retain their existing status.

| Command | Result |
| --- | --- |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 existing tests after frontend probe removal. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed after frontend probe removal. |
| `mise x -- dotnet build StageTamagotchiKirie.csproj --no-restore` | Passed after all native diagnostic removal, no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Passed after all native diagnostic removal. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Passed after all native diagnostic removal. |
| `mise x -- pnpm exec moeru-lint apps/stage-tamagotchi-kirie/README.md apps/stage-tamagotchi-kirie/MIGRATION.md apps/stage-tamagotchi-kirie/docs/*.md apps/stage-tamagotchi-kirie/src-web/src/renderer/host-context/{app,auth,external-navigation,global-shortcuts,pointer}.ts` | Passed. |
| `mise x -- pnpm lint` | Failed with the existing 1,715 errors and 701 warnings. |
| `git diff --check` | Passed. |

## Follow-up checks

### Resize cursor indicators (2026-09-30)

Main forwards input through `Node._Input` to the existing native resize controller.
The controller consumes edge motion after setting the horizontal, vertical, or diagonal resize cursor.
Interior motion remains available to the WebView, which selects its normal hand or text cursor.
The controller retains its existing edge detection, DPI scaling, native resize calls, and cursor cleanup.

The previous `WindowInput` callback set the cursor before Godot processed GUI input.
The hovered Control then replaced that cursor during the same event.
See Godot's [window input dispatch](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/window.cpp#L2020)
and [viewport input processing](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/viewport.cpp#L3502).

A temporary macOS Godot probe loaded the actual main scene and added a Control with hand and text cursors.
All eight resize directions retained the expected cursor through the next frame.
Interior motion, window exit, and disabled resizing restored the expected Control cursor. All 28 cursor assertions passed.
No permanent test was added. Windows cursor review remains pending.

Checks: `mise x -- dotnet build StageTamagotchiKirie.csproj`,
`mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests`,
and `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` passed.
The first build used `--no-restore` and found stale GodotSharp 4.7.1 assets. Normal restore resolved them without dependency changes.
The native probe exited with code 0 and reported two leaked ObjectDB instances.
Root `mise x -- pnpm lint` retained the existing 1,715 errors and 701 warnings.

### Review verification (2026-09-30)

The retained changes remove 27 production lines and add no permanent tests.
The native development session exited with code 0 and one reported ObjectDB leak before the event experiment was withdrawn.
These checks do not extend physical pointer, click-through, mixed-DPI, or Windows acceptance.

| Command | Result |
| --- | --- |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 existing tests. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm typecheck` | Passed, 54 tasks. |
| `mise x -- pnpm lint` | Failed with the existing 1,715 errors and 701 warnings. |
