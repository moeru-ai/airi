# Dependency patches

## @xsai-ext/responses 0.5.1

This patch fixes behavior in the published SDK. AIRI's protocol and billing code remain in workspace packages.

- Reject `response.incomplete` and stream error events so AIRI does not store failed turns.
- Type native `web_search` tools and their output Items for replay across steps.
- Await `onNativeEvent` before transcript commit so consumers can retain sources and search activity.

Browser regressions are in `packages/provider-inference/src/responses.browser.test.ts`. Core integration tests use the real patched SDK with synthetic HTTP responses in `packages/core-agent/src/runtime/responses.test.ts`.

The patch changes `dist` because the npm artifact ships compiled code. To contribute upstream, port these changes to the corresponding sources in [xsAI](https://github.com/moeru-ai/xsai), then run the same regressions.

Remove the patch when an upstream release passes these tests and provides native event callbacks and web search types. Recheck incomplete-response behavior before removal: AIRI treats an incomplete turn as a failure.

To update the patch:

```sh
pnpm patch @xsai-ext/responses@0.5.1
# Edit the directory printed by pnpm.
pnpm patch-commit <directory>
```

## @moeru/three-mmd 0.2.0-beta.2

The toon shader multiplied sphere colors by diffuse lighting before both sphere blend modes.
Multiply mode then multiplied the complete shaded surface by that result, applying lighting twice and darkening skin and emissive glow.

The patch applies the extra lighting factor only to additive sphere maps.
Multiply sphere maps apply their color directly, so a white sphere map leaves the surface unchanged.

The browser regression in `packages/stage-ui-mmd/src/utils/mmd-sphere.browser.test.ts` compares rendered pixels with and without a white multiply sphere map.
It covers dim lighting with and without emissive glow.

The patch changes compiled code because the published package contains no source files.
Remove it when an upstream release passes this regression.
