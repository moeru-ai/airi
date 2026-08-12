I checked the current repository state and PR #2 before laying this out. The main takeaway is that this should be treated as a **semantic rebase of Cubism 2 onto current `main`**, not as “fix the existing PR until it happens to compile.” `main` has moved another 11 commits since PR #2’s original base, including Stage/UI and dependency changes, so current `main` needs to remain the source of truth.

The two design points I would preserve are already good: the Cubism runtime falls back to Cubism 4/5 when Cubism 2 Core is unavailable or fails to load, rather than making Cubism 2 a hard dependency,  and the feature keeps the `stage-ui-live2d` package dependency surface almost identical to `main`, with essentially the new `./vite` subpath being the intentional manifest addition.

## Implementation plan

1. **Rebuild the integration on top of the latest `main`, without modifying `feat/cubism2-support` yet.**

   * Create a new integration branch based on the current validated Cubism history plus the **latest** `main`.
   * Construct the reconciliation so the original `feat/cubism2-support` head remains an ancestor. That lets us eventually update the real feature branch with a normal non-forced fast-forward.
   * Use the tree from current `main` as the starting point. Replay only the Cubism-specific semantic changes.
   * Treat current-main versions of `Stage.vue`, provider UI, settings UI, app infrastructure, package versions, and `pnpm-lock.yaml` as authoritative.
   * Do **not** resurrect older feature-side changes to i18n, report dialogs, provider settings, or unrelated Stage UI merely because they existed in the old branch.

2. **Fix the Cubism Core build architecture at its source.**

   * PR #2 currently imports:
     `Cubism2Core` from `@proj-airi/unplugin-live2d-sdk/vite`.
   * CI proved that `@proj-airi/unplugin-live2d-sdk@0.1.7` does **not** export that symbol. This is the direct reason the Stage Web build currently fails.
   * Keep `DownloadLive2DSDK()` from the existing package for the supported modern Live2D SDK workflow.
   * Implement the Cubism 2 provisioner locally under `packages/stage-ui-live2d/src/vite/` and export it through `@proj-airi/stage-ui-live2d/vite`.
   * The package then owns its Cubism 2 build contract instead of depending on an API that may not exist or may change independently.
   * `apps/stage-web`, `stage-tamagotchi`, and any other consumer should become conceptually:
     `DownloadLive2DSDK()` from the existing SDK plugin plus `Cubism2Core(...)` from `@proj-airi/stage-ui-live2d/vite`.

3. **Turn the existing Cubism option helper into a complete, deterministic Vite provisioner.**

   * The existing helper already defines useful source ordering, SHA-256 metadata, cache location, timeout, and `bundle | external | none` distribution modes.
   * Keep those concepts, but the new local `Cubism2Core()` plugin must actually:

     * resolve the configured/local Core source;
     * verify SHA-256 before accepting a remote Core;
     * cache verified content;
     * expose one stable virtual module, `virtual:live2d-sdk/cores`;
     * provide `{ available, url, sri, expectedGlobal }`;
     * use `Live2D` as the expected Cubism 2 global;
     * generate SRI for script injection;
     * emit the asset for `distribution: 'bundle'`;
     * expose a verified external URL for `external`;
     * return `available: false` without breaking compilation for `none`.
   * A missing Cubism 2 Core must **never make the whole application unbuildable**. It should disable Cubism 2 while leaving Cubism 4/5 operational.
   * Keep the Node/build-time implementation isolated behind the `./vite` export so Node APIs never leak into the browser runtime package.

4. **Make the virtual-module type contract package-owned as well.**

   * The current runtime imports `cubism2Core` from `virtual:live2d-sdk/cores`.
   * PR #2 demonstrated that dropping an ambient declaration somewhere in the package is not enough for every workspace consumer.
   * Define a normal exported `ProvisionedLive2DCore` interface in the Vite module and provide a colocated declaration for `virtual:live2d-sdk/cores`.
   * Ensure `live2d-runtime.ts` explicitly includes or references that local declaration so `vue-tsc` does not depend on another package's ambient types.
   * Add a `./vite/client` type export only if consumer projects actually need it; otherwise keep the virtual declaration internal.
   * Verify it independently under:

     * `@proj-airi/stage-ui-live2d`
     * Stage Web
     * Stage Tamagotchi
     * Stage Pocket.
   * This removes the previous fragile dependency on `@proj-airi/unplugin-live2d-sdk/types`.

5. **Reconcile Cubism runtime code against current-main Live2D behavior file by file.**

   * Preserve the feature's generation-aware settings/loaders rather than returning to separate old Cubism-only forks.
   * Preserve all upstream fixes already brought in from `main`:

     * OPFS/HTTP data should use `response.arrayBuffer()` rather than blob conversion;
     * ZIP loading must handle Windows paths;
     * percent-encoded paths, spaces, CJK filenames and backslashes must normalize correctly;
     * path normalization must happen **after generation-specific model settings resolve the URL**;
     * current Stage render/load error reporting and retry behavior remains authoritative.
   * Keep error adaptation at the Live2D component boundary instead of changing current-main Stage APIs to accommodate the feature.
   * Keep the current runtime behavior where Cubism 2 Core failure logs a warning and falls back to `pixi-live2d-display/cubism4`.
   * Preserve the runtime singleton so multiple models do not repeatedly inject the Core script.

6. **Keep app integration deliberately tiny.**

   * Stage Web and Stage Tamagotchi should only need a Vite import plus `Cubism2Core(...)` registration. No other feature-specific changes should be present in their Vite configs.
   * Stage Pocket needs special cleanup. Current `main` has `@proj-airi/unplugin-live2d-sdk` as a dev dependency but does **not** depend directly on `@proj-airi/stage-ui-live2d`.
   * I would not preserve the previous `../../packages/stage-ui-live2d/src/vite` relative import. That creates an undocumented cross-package build dependency.
   * If Pocket needs Cubism 2 provisioning, add an explicit workspace **devDependency** on `@proj-airi/stage-ui-live2d` and consume the public `@proj-airi/stage-ui-live2d/vite` export.
   * If Pocket does not actually render/use the Live2D runtime on that build path, leave it completely untouched.
   * This is one of the checks I would make during implementation rather than automatically spreading Cubism-specific configuration across all apps.

7. **Expand the tests around compatibility contracts, not only Cubism 2 success cases.**

   * Add focused tests for Cubism 2 `.model.json` recognition and generation selection.
   * Verify modern `.model3.json` Cubism 4/5 behavior remains unchanged.
   * ZIP tests should cover:

     * CJK texture names;
     * spaces;
     * backslash-separated paths;
     * percent-encoded paths;
     * nested archive directories.
   * OPFS tests should verify both stored blobs and fetched `Response` objects.
   * Provisioner tests should cover:

     * valid local Core;
     * valid remote Core + matching SHA;
     * hash mismatch;
     * unreachable URL;
     * timeout;
     * `bundle`;
     * `external`;
     * `none`.
   * Runtime tests should cover:

     * Cubism 2 available → combined runtime;
     * Cubism 2 unavailable → Cubism 4 runtime;
     * Core script load failure → Cubism 4 fallback;
     * expected `Live2D` global missing → fallback;
     * repeated initialization → no duplicate script injection.
   * Fix the known formatting failure in `Model.vue` at the same time; PR #2's autofix/lint run caught the missing terminal newline.

8. **Rebuild the dependency state from current `main`, not from the old feature lockfile.**

   * Start with current-main `package.json`, workspace catalog, and `pnpm-lock.yaml`.
   * Keep `stage-ui-live2d`'s manifest delta minimal. Right now the intended difference from main is the `./vite` export, which is a good boundary.
   * Add new dependencies only where the new local plugin genuinely requires them.
   * Prefer type-only or structural Vite interfaces where practical. If a Vite type dependency is necessary, make it a build/dev dependency rather than a browser runtime dependency.
   * Regenerate the lockfile **once from current main** after all dependency decisions.
   * Gate the result with `pnpm install --frozen-lockfile`. PR #2 already showed this gate works and that the previous lockfile itself was not the source of its build failure.

9. **Validate in increasingly broad gates before moving the real feature branch.**

   * First gate: focused Live2D package typecheck, tests and lint.
   * Second gate: Vite config loading for every app that registers Cubism 2.
   * Third gate: Stage Web, Tamagotchi and Pocket builds individually.
   * Fourth gate: complete repository typecheck, unit tests and lint.
   * Fifth gate: complete CI build matrix plus `autofix.ci`.
   * Sixth gate: clean-checkout `pnpm install --frozen-lockfile`.
   * Seventh gate: actual functional smoke testing:

     * load a Cubism 2 directory model;
     * load a Cubism 2 ZIP;
     * load a ZIP with CJK/spaces;
     * load through OPFS/Electron;
     * load representative Cubism 4/5 models;
     * deliberately break Cubism 2 Core and confirm Cubism 4/5 still render.
   * A green compiler alone is **not** sufficient to declare the feature compatible.

10. **Only after those gates pass, update `feat/cubism2-support` safely.**

    * Fetch the feature branch head again immediately before mutation.
    * If someone has pushed new work to it, stop the ref update and integrate those commits first.
    * Ensure the validated integration history contains the current feature head as an ancestor.
    * Advance `feat/cubism2-support` using a **non-forced** ref update.
    * Compare `main...feat/cubism2-support` afterward and require:

      * `behind_by = 0`;
      * no unexpected dependency/lockfile divergence;
      * changes concentrated in `stage-ui-live2d` plus minimal app build registrations;
      * no stale Stage/settings/provider/i18n files.
    * Keep `main` untouched. PR #2 is a validation vehicle, not something I would blindly merge into `main`.
    * Once the replacement current-main validation is green, PR #2 can be closed or clearly marked superseded.

## What “merge-compatible” should mean here

The goal should not be merely “Git reports no conflicts.” A successful Cubism branch should have **main's architecture plus a narrow Cubism capability layer**. Future Stage UI refactors should therefore mostly pass around the feature instead of colliding with it.

The strongest long-term boundary is:

**`packages/stage-ui-live2d` owns all Cubism-generation detection, Cubism 2 provisioning, runtime fallback, loaders, and compatibility tests. Apps only opt into the build plugin. Current `main` owns Stage UI, provider UX, dependency versions, and the lockfile.**

That gives us a much smaller future merge surface and also removes the biggest current fragility: depending on a nonexistent `Cubism2Core` export from `@proj-airi/unplugin-live2d-sdk@0.1.7`.

I would use this plan as the implementation sequence for the next pass rather than continuing to patch PR #2 on its obsolete `main` base.
