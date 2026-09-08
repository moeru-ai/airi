---
name: author-live2d-lighting
description: Author and bind model-specific Live2D lighting normals in AIRI. Use for a new rig, correcting AI normals, or producing a reviewed lighting attachment and visual proof. This is an agent-assisted authoring workflow, not automatic face recognition.
---

# Author Live2D lighting

Produce a separate, fingerprinted lighting attachment. Preserve the model archive and any other character's reviewed lighting. Generation and replacement start only when the user requests them.

Use `$agent-browser` and `$agent-browser-electron` for the desktop runtime. Use `$use-agent-browser-for-airi` only when importing a model. Inspect the selected model and existing attachment before writing data. The Hiyori example is in [docs/lighting/hiyori](../../../docs/lighting/hiyori); its indices are examples, not defaults for another rig.

## Capture and infer

1. Identify the model source, selected model ID, and asset fingerprint from the ambient-light devtool. Check for a saved attachment. Keep a copy before replacement.
2. Use a **separate devtool renderer** for capture/review. Verify the target URL immediately before each browser evaluation. Cubism's shader singleton is shared within a renderer; a second GL context in the character window can corrupt its programs. The capture/review APIs reject the Electron leader window.
3. Call `captureNormalReference(source, modelId, fingerprint)` from `packages/stage-ui-live2d/src/lighting/capture.ts`. It uses parameter defaults, a fixed-size target, real Cubism masks, and an encoded drawable ownership pass. Export its blobs as data URLs plus its drawable references to `capture.json`.
4. Run `scripts/prepare.py CAPTURE_JSON MODEL_ZIP OUTPUT_DIRECTORY` with a Python environment containing Pillow. Inspect the neutral capture and the alpha-masked atlas contact sheets. The helper expects one model3.json in the archive. Captures use image UVs; atlas contact sheets invert atlas V.
5. Run the existing local worker `apps/stage-tamagotchi/scripts/lighting/marigold.py` with JSON stdin `{"png": "data:image/png;base64,..."}` from the neutral capture. Set `AIRI_NORMAL_WEIGHTS` to the cached checkpoint directory and use Python with the worker's dependencies. It stays offline. Preserve the returned generator metadata and PNG as `raw-normal.png`. Inspect the actual returned device; sandboxed runs can fall back to CPU.

Do not treat a successful inference as a finished normal map. Painted blush, eye highlights, and shadow boundaries can become false relief.

## Review the layers and author corrections

Use the contact sheet, neutral image, and drawable geometry together:

- Identify the full face mesh, including its hidden forehead. Fit `faceSurface.center` and `radius` from that mesh's neutral reference bounds. A visible-skin bounding box places the center too low beneath bangs.
- Explicitly list the face's painted layers: blush, mouth, eyes, lids, and authored shadows. They should share a broad curved surface. Keep hair, ears, neck, and clothing separate unless their own reviewed corrections justify another surface.
- Color is evidence, not a classifier. Hiyori's brown bangs passed a warm-skin heuristic and were wrongly selected as a face. Verify each included layer visually.
- Preserve the painted shading. The SDK retains multiply/additive operations. Do not add another hair shadow just because the normal model suggests one.
- A distinct nose is optional. Inspect a small central drawable and verify its reference bounds. When present, set `faceSurface.nose` with its drawable index, center, radius, and modest strength. The runtime follows that mesh's deformation through `NoseAttachment`. If no distinct nose exists, omit this field; do not assume the geometric center is a nose.
- Inspect the rig's actual yaw parameter and endpoints before setting `faceSurface.yaw`. Normal rotation is an authored approximation; test both endpoints.

`NormalAttachment` and `ReviewedFaceSurface` in `packages/stage-ui-live2d/src/lighting/attachment.ts` own the schema. The correction function lives in the adjacent `face-normals.ts`. `refineFaceNormals(attachment, reviewedSurface)` produces a corrected PNG and retains the raw map. The shader evaluates that same broad surface for each reviewed paint layer, so hidden or translucent regions do not revert to a different face shape at ownership boundaries.

Keep material settings unchanged for the first comparison. A new normal should not be judged against simultaneously changed exposure, brightness, and roughness. Tune additional properties only when the visual evidence calls for them.

## Verify, install, and hand off

1. Call `reviewNormalAttachment(source, modelId, attachment)` from `src/lighting/review.ts` in the separate renderer. It returns a contact sheet: raw neutral, corrected neutral, and corrected yaw endpoints under left, right, and overhead screen light. Inspect the PNG, not only the GPU status.
2. Reject correction spill onto hair or clothes, sharp cheek/mouth patches, double painted shadows, a detached nose highlight, or GL errors. Revise the reviewed assignments or surface dimensions and repeat. Show any remaining pose limitations rather than claiming arbitrary-pose support.
3. Preserve `profile.json`, neutral/raw/corrected normal PNGs, ownership, and coverage together. In the portable JSON, blob fields are relative filenames. Resolve them to Blobs before calling the runtime APIs. Keep the asset fingerprint and exact drawable topology; a renamed model can match, a different rig cannot.
4. Validate the attachment against the loaded rig and save it with `saveNormalAttachment`. It replaces only that fingerprint's IndexedDB record. Selecting/reloading that model then loads the saved binding; it never starts inference. The Hiyori profile is a worked example of this bundle.
5. Verify the ambient devtool reports the saved binding. If you temporarily changed the selected character for testing, restore the user's original character and confirm its binding. To restore a built-in authored binding, remove only that model's generated override, then reload it.
6. Report the bundle and comparison paths, actual checks, unresolved quality limits, and which model is active. Run scoped tests/lint for changed runtime code. Follow the user's instruction about typecheck cost.

The workflow is complete when another agent can reproduce capture, inspect the layer evidence, apply the reviewed correction, and install the bundle without guessing undocumented mesh IDs or changing the original model.

## Browser API examples

Run these in the selected devtool through `agent-browser eval --stdin`. Replace the repository URL prefix and model values with the inspected runtime values. Do not use a separate HTTP origin: IndexedDB attachments belong to the app's origin.

Export a capture (write the returned JSON to disk with the browser tool):

```js
const api = '/@fs/ABSOLUTE_REPO/packages/stage-ui-live2d/src/lighting/'
const { captureNormalReference } = await import(api + 'capture.ts')
const capture = await captureNormalReference(source, modelId, fingerprint)
for (const key of ['neutral', 'ownership', 'coverage']) {
  capture[key] = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(capture[key])
  })
}
return capture
```

Load an authored portable bundle and review it before saving:

```js
const api = '/@fs/ABSOLUTE_REPO/packages/stage-ui-live2d/src/lighting/'
const bundle = '/@fs/ABSOLUTE_REPO/docs/lighting/MODEL/'
const attachment = await (await fetch(bundle + 'profile.json')).json()
for (const key of ['neutral', 'normal', 'rawNormal', 'ownership', 'coverage']) {
  if (attachment[key])
    attachment[key] = await (await fetch(bundle + attachment[key])).blob()
}
const { reviewNormalAttachment } = await import(api + 'review.ts')
return await reviewNormalAttachment(source, modelId, attachment)
```

The review validates the fingerprint and topology through the real rig. After inspecting its PNG, repeat the bundle load and call `saveNormalAttachment(attachment)` from `attachment.ts`. Keep review and installation separate so a bad comparison cannot be installed by the same unattended call.

To create `profile.json`, combine the capture fields with `schema: 1`, `space: 'x-right-y-up-z-viewer'`, a creation timestamp, and the worker's generator fields. Its `png` result is bare base64, not a data URL. Save it as the initial normal and raw normal files. Add the reviewed `faceSurface`, load the bundle, call `refineFaceNormals`, and export the returned normal Blob as `normal.png`. Do not change the captured topology or fingerprint.
