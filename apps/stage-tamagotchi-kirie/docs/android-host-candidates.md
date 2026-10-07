# Android host candidate checks

The source baseline is `4df962392a88971aa347f4af29c9c9fd330c8876`.
These checks use source and fixtures. They do not establish device visual parity.
Notifications belong to a separate audit.

## Catch-all Go Back

Pocket's `src/pages/[...all].vue` calls `router.go(-1)` for missing routes.
Kirie's navigation module previously intercepted only `router.back()` and native Android Back.
The asset WebView's documented native hash traversal failure left Go Back outside the custom stack.

The router fixture uses real Vue Router with memory history.
Only the native history traversal boundary becomes a no-op, matching the documented asset WebView failure.
Both missing-route tests fail before the fix and pass after it.
Programmatic traversal now uses the same cursor as native Back, including forward navigation and canceled guards.
Home Back remains a no-op.

Run `pnpm -F @proj-airi/stage-pocket exec vitest run --config vitest.config.ts`.
The Vite file watcher is disabled in this fixture configuration.

## Replaced routes

Provider category tabs call `router.replace({ hash })`. Pocket replaces the current history entry.
Kirie previously added each successful replacement to its custom stack. Back stopped at the previous category.

The history replacement boundary now replaces the current custom entry after Vue Router accepts navigation.
This includes `router.push({ replace: true })` and excludes canceled replacements.
Both replacement fixtures fail before the fix and pass after it.

## Microphone grant state

Pocket calls the shared audio store's `askPermission()` before its native panel refresh.
VueUse's `ensurePermissions()` owns the shared permission ref. The shared audio composable also awaits device enumeration.
Kirie previously returned after the native permission response, bypassing both operations.

After a native grant, Kirie now awaits the same shared browser permission operation.
Denied requests still avoid a second prompt. The requested flag and later Settings route remain unchanged.
The source fixture executes the production request functions with real Vue refs and external permission boundaries.
The grant test fails before the fix and passes after it. Denial and Settings tests pass in both versions.
The fixture proves delegation and ordering. It does not prove Android device enumeration at runtime.

## Authorization errors

Pocket's `WebAuthenticationPlugin.kt` catches `RuntimeException` and rejects with `BROWSER_UNAVAILABLE`.
Kirie previously caught only `ActivityNotFoundException` and then sent a successful null response.

Kirie now rejects the missing-browser response with Pocket's code and exact message.
The renderer reconstructs an Error after schema validation of the serialized native rejection.
Other channel failures retain their original rejection. Successful browser opens still resolve.
Existing notification error strings retain their original envelope shape.

Pocket also rejects a missing, blank, or non-HTTP(S) URL with `INVALID_URL`.
Kirie previously resolved these requests. A missing `url` field produced no response.
Kirie now gives both cases Pocket's exact code and message.

The JVM fixture compiles unchanged production methods with external Android boundaries.
Its missing-browser and invalid-URL assertions fail before the fixes and pass after them.
The real Eventa channel fixture also fails before Error reconstruction and passes after it.
Run `python3 tests/android-host-parity/run-fixtures.py authentication --json-jar "$JSON_JAR"` from Kirie.

## WebSocket failure without a message

Pocket's `OkHttpHostWebSocketSessionFactory.onFailure()` uses a fallback for the error event and passes `Throwable.message` to Close.
`HostWebSocketBridge.kt` omits a null close reason when it creates JSON.
Kirie previously reused its error fallback as the close reason. The shared renderer forwards that reason to close listeners.

Kirie now passes the original Throwable message to the close payload. JSON omits null values.
Empty messages, available HTTP response codes, event order, and session cleanup remain unchanged.
The null-message JVM assertion fails before the fix. All six callback cases pass after it.
Run `python3 tests/android-host-parity/run-fixtures.py websocket --json-jar "$JSON_JAR"` from Kirie.

## Candidate decisions

All five requested candidates are confirmed by source and failing fixtures. No candidate is rejected.
Both notification candidates remain outside this change.
These fixtures supply no emulator or visual parity result. Permission grants remain excluded from the default route replay.
The historical Pocket bugs remain untouched, including missing routes, denied-permission paths, and nullable WebSocket close reasons.

## Verification

| Command | Result |
| --- | --- |
| `pnpm -F @proj-airi/stage-pocket exec vitest run --config vitest.config.ts` | Passed 14 tests. Each confirmed gap has a failing pre-fix fixture. |
| `pnpm -F @proj-airi/stage-pocket typecheck` | Passed. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| JVM fixture `authentication` with Pocket's cached JSON test JAR | Passed eight cases. |
| JVM fixture `websocket` with the same JSON test JAR | Passed six cases. |
| Existing native parity fixture `compileDebugJavaWithJavac --offline --no-daemon --max-workers=1 -Dorg.gradle.vfs.watch=false` | Passed complete embedded-plugin Java compilation. No APK assembly ran. |
| Kirie Vitest `--project node` with a temporary `server.watch=null` configuration | Passed 10 files and 32 tests. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Node tests passed. The browser project failed to bind `::1` with `EPERM`. |
| Focused `pnpm exec moeru-lint` for changed TypeScript, Vue, tests, and documents | Passed. |
| `pnpm lint` | Failed with 4,808 errors and 682 warnings on generated native outputs and existing repository warnings. |
| `git diff --check` | Passed. |

No emulator test or full Vite/Godot Android build ran during this source-only task.
The interrupted predecessor replay supplies no claimed parity result.
No recording or Git ignore file changed. Device verification remains follow-up work.
