---
title: Import an Extension From a Folder
date: 2026-09-10
category: plugin-system
module: Electron extension host
problem_type: architecture
component: stage-tamagotchi
severity: medium
applies_when:
  - "Adding a folder import flow for extension.airi.json packages"
  - "Copying an extension into the Electron user-data directory"
  - "Validating plugin paths, symbolic links, and duplicate extension ids"
tags:
  - electron
  - extension-host
  - filesystem
  - manifest
  - security
---

# Import an Extension From a Folder

## Decision

Keep folder selection and all file-system work in the Electron main process. Expose two narrow Eventa operations to the renderer:

1. `prepareImport()` opens the directory dialog and returns a preview plus a short-lived `planId`.
2. `commitImport({ planId })` repeats validation, copies the folder, publishes it, and refreshes the registry.

Do not accept a source path from the renderer. Electron recommends narrow IPC APIs and sender validation for privileged operations. Its IPC guide uses the main process for native dialogs. See the [Electron IPC guide](https://www.electronjs.org/docs/latest/tutorial/ipc) and [security checklist](https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages).

Use `dialog.showOpenDialog(parentWindow, { properties: ['openDirectory'] })`. Treat `canceled` and an empty `filePaths` array as normal cancellation results. The parent window makes the dialog modal. Use the asynchronous API because Electron recommends it on macOS. On Linux, `defaultPath` can depend on the portal version. See the [Electron dialog API](https://www.electronjs.org/docs/latest/api/dialog#dialogshowopendialogwindow-options).

Mac App Store builds need `securityScopedBookmarks` when access continues after selection. Store the bookmark in the plan. Start access before commit and stop access after cleanup. See the [Electron security-scoped resource API](https://www.electronjs.org/docs/latest/api/app#appstartaccessingsecurityscopedresourcebookmarkdata-mas).

## Validation boundary

Treat the selected folder as untrusted data. The prepare operation must not import or execute an entrypoint.

The main process must perform these checks:

1. Inspect the selected root with `lstat()` and reject it if it is a link.
2. Resolve the selected root with `realpath()` and make sure that it is a directory.
3. Walk every entry with `readdir({ withFileTypes: true })` or `opendir()`.
4. Reject symbolic links, sockets, devices, and other non-file entries in phase one.
5. Read `extension.airi.json` as data and validate it with the owning Valibot schema.
6. Resolve each declared entrypoint against the real root.
7. Reject a candidate when `relative(root, candidate)` starts with `..` or is absolute.
8. Reject an empty or unsafe extension id before that id affects a destination path.
9. Reject any id that the current registry already contains.
10. Build a deterministic fingerprint from sorted relative paths, entry types, sizes, and file bytes.

`lstat()` describes a symbolic link itself, while `realpath()` returns the actual location. These APIs support link rejection and containment checks. See the Node.js documentation for [`lstat()`](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromiseslstatpath-options) and [`realpath()`](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesrealpathpath-options).

Use `path.relative()` for containment. A prefix string check is unsafe for sibling names and Windows drive boundaries. If the result is absolute, the two paths are on different Windows drives. See the Node.js [`path.relative()` documentation](https://nodejs.org/docs/latest-v24.x/api/path.html#pathrelativefrom-to).

## Copy and publish sequence

Create the staging directory inside the managed extension root. A sibling staging directory keeps the final rename on the same file system.

Use this sequence:

1. Look up the `planId` in main-process memory and reject expired or consumed plans.
2. Repeat source validation and compare the new fingerprint with the preview fingerprint.
3. Create `<extensionsRoot>/.imports`, then reserve one absent `<random-id>` path inside it.
4. Copy into the staging path with `fsPromises.cp()` and explicit options.
5. Validate the staged copy and compare its fingerprint with the source fingerprint.
6. Make sure that the final destination does not exist.
7. Rename the staging directory to the final destination.
8. Refresh the extension registry and return the new disabled, unloaded snapshot.
9. Remove the staging directory after any failure.

Use `cp(source, staging, { recursive: true, force: false, errorOnExist: true, dereference: false, verbatimSymlinks: true })`. The staging path must not exist before this call. The Node.js API copies a directory tree and exposes all required collision and link options. It became stable in Node.js 22.3. Electron 41 embeds Node.js 24, so AIRI does not need another copy package. See [`fsPromises.cp()`](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisescpsrc-dest-options) and the [Electron 41 stack versions](https://www.electronjs.org/blog/electron-41-0#stack-changes).

The `cp()` options do not replace the explicit tree walk. With `dereference: false`, a link remains a link. The staged validation must therefore reject links again. This second check also detects a source change during copying.

Publish with one awaited `rename()` call. Linux guarantees atomic replacement on one mounted file system and reports `EXDEV` across file systems. Windows directory moves also require the same drive. Keep staging under `extensionsRoot`, require an absent destination, and do not fall back to copy-and-delete. Serialize import commits so two plans cannot pass the destination check together. See [`fsPromises.rename()`](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesrenameoldpath-newpath), [Linux `rename(2)`](https://man7.org/linux/man-pages/man2/rename.2.html), and [Windows `MoveFile`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefile).

## AIRI integration points

The current host already contains most policy inputs:

- `apps/stage-tamagotchi/src/main/services/airi/plugins/host/registry.ts` owns discovery, manifest parsing, and id lookup.
- `apps/stage-tamagotchi/src/main/services/airi/http-server/static-assets/paths.ts` has a real-path containment pattern and link-escape tests.
- `apps/stage-tamagotchi/src/main/libs/electron/persistence.ts` already uses temporary output followed by `rename()`.
- `apps/stage-tamagotchi/src/shared/eventa/plugin/host.ts` owns the typed main-to-renderer contract.
- `apps/stage-tamagotchi/src/main/services/airi/plugins/index.ts` owns Eventa handlers and registry refresh.
- `apps/stage-tamagotchi/src/main/index.ts` uses `injeca` to provide windows and the extension host.

Add the import policy as one cohesive main-process module near the registry. Reuse the manifest parser through an owning public function instead of duplicating its schema call. Reuse or generalize the containment predicate from static assets.

Pass a parent `BrowserWindow` through `SetupExtensionHostOptions` with `injeca`. This keeps native dialog ownership explicit. The import service can then return structured diagnostics through Eventa.

Do not reuse the current duplicate-id behavior for import. The registry currently keeps the first discovered id. Import must report the conflict before copying because silent selection makes the installed result ambiguous.

## Dependency result

No new package is required.

- Use `node:fs/promises` for `cp`, `lstat`, `realpath`, `rename`, and cleanup.
- Use `node:path` for resolution and containment.
- Use `node:crypto` for the plan id and SHA-256 fingerprint.
- Use the existing Valibot schema for manifest data.
- Use `errorMessageFrom()` from `@moeru/std` when an error must cross the IPC boundary.
- Use Eventa for the prepare and commit contracts.

`@electron-toolkit/utils` is already a direct dependency, but it does not own folder copying or import transactions. `pathe` and `tinyglobby` belong to the docs package. They must not become runtime dependencies for this flow.

## Required tests

Add focused Vitest coverage for cancellation, invalid manifests, missing entrypoints, unsafe ids, duplicate ids, source changes, and successful disabled import.

Also cover nested links, broken links, link escapes, destination races, and copy failure cleanup.

Run Windows-style containment cases with `path.win32`. Run the transaction tests against a temporary extension root. Keep UI tests limited to preview, diagnostics, cancellation, and commit state.
