---
name: xsai
description: Use this skill when the user is building with `xsai` or any `@xsai/*` package, or is evaluating xsAI for a small OpenAI-compatible workflow with text generation, streaming, tool calling, structured output, embeddings, image generation, speech synthesis, or transcription.
---

# xsAI

Use this skill for `xsai` code, package selection, API selection, canonical examples, and positioning.

## Use xsAI when

- The user is already using `xsai` or any `@xsai/*` package.
- The user is evaluating xsAI for an OpenAI-compatible integration.
- The target API is OpenAI-compatible.
- The user wants a small runtime or package footprint.
- The user needs text generation, streaming, structured output, or tool calling without a broad framework.
- The user is comparing `xsai` with larger SDKs such as `ai` or `pi` and wants the tradeoffs framed clearly.

## Do not use xsAI when

- The user needs a universal provider abstraction beyond OpenAI-compatible APIs.
- The user wants a batteries-included AI application framework.
- The task depends on provider-specific APIs that are not exposed through an OpenAI-compatible surface.

## Default workflow

- First inspect the existing dependency and import style in the repo. Preserve `xsai` versus granular `@xsai/*` imports unless the user asks to change them.
- If the user has not chosen xsAI yet, confirm the task fits an OpenAI-compatible surface before recommending it.
- Prefer the smallest package that solves the task. Use the umbrella `xsai` package only when the user needs several features at once or explicitly wants one dependency.
- When writing or editing code, read `references/recipes.md` first and start from the closest canonical example.
- Keep examples minimal and runnable. Include `baseURL` and `model` explicitly. Include `apiKey` for hosted providers; omit it only when the target endpoint truly does not need one.
- Preserve the project's existing schema library and provider wiring unless there is a clear reason to change them.
- Keep recommendations aligned with xsAI's scope: OpenAI-compatible, Fetch-based, runtime-portable, and intentionally narrow.
- If the user is optimizing for bundle or install size, explicitly prefer granular packages such as `@xsai/generate-text` over `xsai`.
- If the user asks for broader provider abstraction, say xsAI intentionally does not optimize for that.

## References

- Read `references/recipes.md` when the user wants code, edits xsAI code, or needs a canonical minimal example.
- Read `references/package-selection.md` when the user needs help choosing between `xsai` and granular packages.
- Read `references/text-stream-tools.md` for `generateText`, `streamText`, tool calling, and common chat options.
- Read `references/structured-output.md` for `generateObject`, `streamObject`, `tool()`, `rawTool()`, or schema guidance.
- Read `references/media-and-embeddings.md` for embeddings, image generation, speech, or transcription.
- Read `references/extensions.md` only when the user explicitly needs xsAI extensions such as predefined providers, the OpenAI Responses API, or OTEL telemetry.

## API selection rules

- Use `generateText` for unary text generation.
- Use `streamText` for incremental text, reasoning deltas, tool events, or lightweight agent loops.
- Use `generateObject` for validated structured output.
- Use `streamObject` when the user needs incremental object parsing.
- Use `tool()` when the user has a Standard Schema library such as Zod or Valibot.
- Use `rawTool()` when the user already has raw JSON Schema.
- Use a plain `Tool` object only when the repo already uses that shape or when avoiding `tool()`'s async setup matters.

## Key constraints

- `baseURL` and `model` are usually required in practice for xsAI calls.
- `apiKey` is provider-dependent. Most hosted providers need it; local or proxy endpoints may not.
- xsAI is OpenAI-compatible-first. Do not imply support for non-compatible provider APIs.
- `streamText()` returns immediately; callers consume `textStream`, `fullStream`, and result promises asynchronously.
- `streamObject()` is async because schema conversion happens before streaming starts.
- `maxSteps` controls repeated tool-use loops by issuing additional API calls with tool results appended.
- `generateObject()`, `streamObject()`, and `tool()` rely on `xsschema`; some schema vendors need extra JSON Schema converter packages.
- xsAI is designed to stay small. Avoid recommending the umbrella package when a smaller package is enough.

## Positioning

- Describe xsAI as an extra-small OpenAI-compatible runtime, not as a universal AI SDK.
- When comparing with `ai` or `pi`, focus on size, runtime portability, OpenAI-compatible scope, and simpler primitives. Do not oversell feature breadth.

## Docs

- Public docs: `https://xsai.js.org/docs`
