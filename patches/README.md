# Dependency patches

## @xsai-ext/responses 0.5.0

This patch fixes behavior in the published SDK. AIRI's protocol and billing code remain in workspace packages.

- Reject EOF before a terminal event, `response.failed`, and `response.incomplete`.
- Await asynchronous `onEvent` callbacks before finishing or starting another tool step.
- Cancel and release each step's reader on completion, failure, tool continuation, or abort.
- Accept OpenAI `response.reasoning_text.delta` and `.done` events alongside the Open Responses event names.
- Do not assign a random provider Item ID to a local function output. The provider owns Item IDs; `call_id` matches the function output to its call.
- Export the existing `ItemParam` type for consumers that retain native history.

Browser regressions are in `packages/provider-inference/src/responses.browser.test.ts`. Core integration tests use the real patched SDK with synthetic HTTP responses in `packages/core-agent/src/runtime/responses.test.ts`.

The patch changes `dist` because the npm artifact ships compiled code. To contribute upstream, port these changes to the corresponding sources in [xsAI](https://github.com/moeru-ai/xsai), then run the same regressions. No upstream PR has been opened.

Remove the patch when an upstream release passes these tests and provides the Item type export. Recheck incomplete-response behavior before removal: AIRI treats an incomplete turn as a failure.

To update the patch:

```sh
pnpm patch @xsai-ext/responses@0.5.0
# Edit the directory printed by pnpm.
pnpm patch-commit <directory>
```
