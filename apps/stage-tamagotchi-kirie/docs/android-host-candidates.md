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
