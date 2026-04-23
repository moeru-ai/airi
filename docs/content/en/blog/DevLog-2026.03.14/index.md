---
title: DevLog @ 2026.03.14
category: DevLog
date: 2026-03-14
excerpt: |
  A story about PR #1194: debugging AIRI's VRM 3D stage, redesigning its lifecycle, introducing a window-local cache, and laying the first foundation for ThreeScene observability.
preview-cover:
  light: "@assets('./assets/cover-light.avif')"
  dark: "@assets('./assets/cover-dark.avif')"
---

Hi, this is [@Lilia-Chen](https://github.com/Lilia-Chen).

Lately I have been working on AIRI's VRM / Three.js runtime, the 3D stage shared across AIRI's web, desktop, and mobile apps. The DevLog for today is about [#1194](https://github.com/moeru-ai/airi/pull/1194), which I opened on March 8, 2026 and merged on March 12, 2026.

The story is simple: the VRM stage had reached the point where it was too easy for lifecycle mistakes to disguise themselves as rendering bugs, performance bugs, or random "loading forever" bugs.

So this became a clean-up, a redesign, and a debugging diary all at once.

I also want to thank [@neko](https://github.com/nekomeowww) and [@Makito](https://github.com/sumimakito) for their reviews and help throughout this work.

This was also my first serious pass through the `stage-tamagotchi` runtime. I ended up learning far more about Eventa and `injeca` than I expected, because debugging the stage quickly stopped being a single-component problem.

## Why Touch This Code at All?

By the time I started this work, there was already a cluster of bugs around the VRM stage:

- VRM instances could overlap or behave as if old models were not really gone.
- The stage could get stuck in `loading`.
- Repeatedly loading different VRM models could push GPU and memory usage into unhealthy territory.
- Deep disposal and resource ownership were inconsistent enough that it was hard to tell which scene actually "owned" the current model.

Once I started debugging, the failure mode got even stranger: in development, even the first click on certain buttons could remount part of the scene, send it back into `loading`, and leave it stuck there.

## First Diagnosis: We Needed Better Lifecycle Management

Previously, too much of the runtime behavior followed incidental Vue component lifetime:

- mount means maybe load,
- unmount means maybe destroy,
- remount means maybe rebuild everything,
- and if two scenes touched the same state at nearly the same time, whoever wrote last "won".

That is not a design. That is just surviving until the next remount.

For a while, that kind of setup can still appear to work. But once you add:

- a main stage,
- a settings preview scene,
- HMR,
- asynchronous model loading,
- object URLs,
- cached GPU resources,
- and cross-window behavior,

the whole thing becomes extremely fragile. So the basic design goal became:

1. Make scene ownership explicit.
2. Make model replacement explicit.
3. Make disposal reason-aware.
4. Make stale async work harmless.
5. Make the runtime observable enough that we can verify what happened, instead of guessing.

## Designing a Window-Local VRM Cache

One of the first structural changes was the detached VRM cache.

If the same scene in the same window temporarily unmounts and remounts, it should be able to reuse the detached VRM instance instead of paying the full parse-and-compile cost every time.

The core shape is basically:

```ts
interface ManagedVrmCacheState {
  detachedByScope: Record<string, ManagedVrmInstance | undefined>
}
```

Each `ManagedVrmInstance` stores the currently detached runtime bundle:

- the `VRM`,
- its `Group`,
- the `AnimationMixer`,
- the emote controller,
- the `modelSrc`,
- and the `scopeKey`.

The `scopeKey` is derived from `window.location.href`, and the cache state lives in module state, including `import.meta.hot.data` during development. In practice this means:

- each browser window has its own cache state,
- each route scope gets its own detached slot,
- and HMR does not automatically wipe the cache every time a module reloads.

The main stage and the settings preview may point to the same `modelSrc`, but they do not belong to the same scene lifecycle. A global optimistic cache would make ownership ambiguous very quickly. A window-local, scope-keyed cache is much easier to reason about.

The cache APIs:

- `takeManagedVrmInstance`
- `stashManagedVrmInstance`
- `clearManagedVrmInstance`

and the disposal policy is reason-based:

- on `component-unmount`, stash if possible,
- on `model-switch`, destroy aggressively,
- when cache entries are evicted or invalid, deep-dispose them.

That last point matters. A cache is not a memory leak with a more polite name. If an instance cannot be reused safely, it must die.

## Making VRM Loading Race-Safe

Once caching existed, loading also had to become more disciplined.

The old problem was simple: asynchronous loads could finish out of order. If the user switched models quickly, or if a scene was remounting while another load was still in flight, stale work could still arrive late and mutate the active scene.

So the loading pipeline now carries a request sequence:

```ts
const requestId = invalidatePendingLoads()
if (!isLoadRequestCurrent(requestId))
  // eslint-disable-next-line no-useless-return
  return
```

That pattern appears throughout the VRM loading flow:

- after waiting for the scene,
- after reading from the cache,
- after loading the VRM,
- after loading the idle animation,
- before committing the instance.

If a load becomes stale, the result is disposed rather than committed.

This also changed the conceptual flow of VRM loading into something much more explicit:

```text
load -> validate -> commit
```

Cache hits follow the same rule. Reusing a detached instance is only allowed after validation. If the cached instance is no longer healthy, it is destroyed and the loader falls back to the normal path.

## Reworking `ThreeScene` Lifecycle Management

After that, the bigger work began: `ThreeScene` itself needed a lifecycle model.

Before this refactor, the dependencies between `ThreeScene`, `TresCanvas`, `OrbitControls`, camera state, and `VRMModel` were real, but too implicit. Once the subtree remounted, whether because of HMR or some other update path, that loose coordination could fall apart.

This was how messy it looked before:

![ThreeScene lifecycle before](./assets/ThreeScene-before.avif)

And this is how it moves phase by phase now:

![ThreeScene lifecycle after](./assets/ThreeScene-after.avif)

The redesign introduced a few key ideas:

- an explicit `scenePhase`,
- a binding transaction depth,
- a mutation lock derived from phase and transaction state,
- and a clearer split between VRM model readiness and scene readiness.

`ThreeScene` now tracks phases like:

- `pending`
- `loading`
- `binding`
- `mounted`
- `no-model`
- `error`

There are at least two separate readiness signals that matter:

- `VRMModel` is loaded and has produced bootstrap data.
- `OrbitControls` has access to the actual camera and renderer-backed DOM element.

Those two signals can arrive in different orders, so `ThreeScene` now coordinates them through a binding transaction.

The flow is roughly:

1. `VRMModel` emits `loadStart`, which begins a binding cycle.
2. `VRMModel` later emits bootstrap data and `loaded`.
3. `OrbitControls` independently emits `orbitControlsReady`.
4. When binding can actually complete, `ThreeScene` enters `binding`, applies bootstrap state, updates controls on the next tick, closes the transaction, and resolves the final phase.

This also made the interaction between `ThreeScene`, camera state, and controls much easier to reason about. The camera can exist before the scene is really interactive. `OrbitControls` can be instantiated before the scene is fully mounted. But user-facing mutations are gated until the binding window is over.

That is where `sceneMutationLocked` comes in. It is not a hard lock in the database sense. It is a runtime coordination lock: if the scene is not fully mounted, or if a binding transaction is still open, UI mutations should not be allowed to treat the scene as stable.

That lock is then used to disable or delay writes from settings panels and to keep controls from becoming active too early.

## The Model Selector Also Needed Cleanup

While fixing the `ThreeScene`, I found that the model selector and preview path had their own lifecycle issues.

There were two separate problems there.

### Preview Scene Cleanup

The preview renderer path was creating an offscreen `WebGLRenderer` for VRM previews, but its cleanup path was not strong enough.

That was fixed by making preview teardown explicit:

- stop animation actions,
- deep-dispose the preview VRM,
- clear the preview scene,
- dispose the renderer,
- force context loss,
- revoke the object URL,
- zero out the offscreen canvas size.

### Model URL Lifetime and Race Protection

The stage model URL logic also turned out to be more fragile than it should have been.

Previously, the selected URL could briefly become `undefined` during updates, which was enough to trigger an unnecessary teardown-and-reload cycle in the renderer.

The fix there was to make URL replacement and revocation more disciplined:

- treat the selected model as stable state,
- replace the URL only when the next URL is actually ready,
- guard async updates with a request sequence,
- revoke old blob URLs carefully instead of eagerly.

## The Bug That Refused to Die: `TresCanvas` Size = 0

After all of that, I expected the stage to finally stop getting stuck in `loading`.

It still got stuck.

At that point I went back to tracing and started tearing apart the render path more aggressively. The symptom was that `TresCanvas` never really became ready, and eventually the problem showed up as a size-related failure: the canvas path was effectively seeing a `0x0` render area.

This took a while to isolate.

One important clue was that in development, `@tresjs/core` registers an HMR path that reacts to `vite:afterUpdate`. This isn't limited to `.vue` or `.ts` changes. UnoCSS regenerating `__uno.css` can also trigger a subtree remount. That explained why even the first click on certain buttons could destabilize the stage in dev: new classes could produce a CSS update, which in turn remounted parts of the Three scene.

But that was not yet the real deadlock.

The actual deadlock was caused by the loading UI itself.

The stage page used to wrap the `WidgetStage` in `v-show="!isLoading"`. That meant the parent of `TresCanvas` became `display: none` while the stage was waiting to leave loading. Unfortunately, Tres measures its size from its parent element. If the parent is hidden, the measured size is `0x0`. If the size stays `0x0`, `@ready` never fires. If `@ready` never fires, the stage never leaves loading.

So the deadlock looked like this:

```text
loading starts
-> parent becomes display:none
-> TresCanvas measures 0x0
-> @ready never fires
-> scene never reaches mounted
-> loading overlay never goes away
```

The fix was not complicated once the real cause was clear:

- keep the stage mounted in the DOM,
- move the loading UI into an overlay layer above it,
- and give `TresCanvas` explicit width and height through `Screen`, instead of letting it depend on a parent that may disappear.

That change finally removed one of the most annoying "it still hangs" bugs in this entire debugging session.

## One Last Regression: Web Broke Too

After most of the desktop-side issues were fixed, I went back to the web app and immediately found another regression. This time the symptom was different: the VRM settings page looked locked up. The write lock never seemed to release.

That pointed back to `sceneMutationLocked`, but the real root cause was not inside `ThreeScene` itself. It was in `apps/stage-web/src/App.vue`.

The app was still using:

```vue
<KeepAlive :include="['IndexScenePage', 'StageScenePage']">
  <component :is="Component" />
</KeepAlive>
```

That meant even after navigating into settings, the main page scene could remain alive in the router tree. In effect, there could be two `ThreeScene` instances still running against shared state:

- the main page scene,
- and the settings preview scene.

Both were still reporting their own scene phase and mutation state, so the lock semantics became confused. From the settings page's perspective, it looked as if the lock never fully settled.

The fix there was simply to remove that `KeepAlive` wrapper. Once the hidden scene actually stopped living, the lock semantics became consistent again.

## Using Eventa for Tracing

One part of this PR that I especially wanted was tracing.

The current tracing work is still fairly basic, but it is already much better than having to debug the VRM stage entirely from intuition and `console.log`.

The trace layer now lives inside `@proj-airi/stage-ui-three`, with Eventa as its event contract. On the performance side, it records things like renderer info snapshots, hit-test readback timing, and per-frame VRM update breakdowns. On the lifecycle side, it traces load and dispose, cache `take` / `stash` / `clear`, scene phase changes, and transaction begin / end / reset. On desktop, those events are forwarded through Eventa into a simple diagnostics view.

The future TODO here is to build a proper observability tool for `ThreeScene`:

- better lifecycle introspection,
- better performance timelines,
- better resource accounting and scene correlation,
- and a much more complete O11y surface for the 3D runtime.

## Closing

So, what did `#1194` really do?

- It cleaned up memory leaks and disposal paths.
- It introduced a window-local VRM reuse cache.
- It made async loading less race-prone.
- It gave `ThreeScene` a more explicit lifecycle model.
- It fixed the `TresCanvas size=0` loading deadlock.
- It exposed the `KeepAlive` regression on web.
- It established the first usable tracing path for this runtime.

Most importantly, it turned a pile of loosely coupled behaviors into something I can now explain, reason about, and debug.

There is still plenty left to improve, especially around tracing and the future O11y tooling for `ThreeScene`, but at least now the runtime feels like it has an owner again.

If you want to read the code directly, start with [#1194](https://github.com/moeru-ai/airi/pull/1194). I am also continuing to track VRM-related issues in [#1173](https://github.com/moeru-ai/airi/issues/1173).
