# Vendor patches

Local changes to vendored submodules that cannot be pushed upstream.

## cortico-local-fixes.patch

Applies to `vendor/cortico` (submodule `https://github.com/Pal-AI-Lab/Cortico.git`,
base commit `d64dd5fadf6255e2551fa97fc194702f53749752`).

Contents: lint-style fixes (`?? {}` spreads, regex → `startsWith`), a Windows
path literal in `scripts/dev-console.ts`, and test harness tweaks. No behavior
changes to the runtime paths the bridge uses.

Apply after `git submodule update`:

```sh
git -C vendor/cortico apply ../vendor-patches/cortico-local-fixes.patch
```

Regenerate after editing the submodule:

```sh
git -C vendor/cortico diff > ../vendor-patches/cortico-local-fixes.patch
```

Remove entries once they land upstream.
