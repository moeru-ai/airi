# Structured Output

Use this reference for `generateObject`, `streamObject`, `tool()`, `rawTool()`, and schema guidance.

## Structured output APIs

- `generateObject`: unary structured output with validation
- `streamObject`: incremental structured output

Both rely on schema conversion through `xsschema`.

## Schema guidance

xsAI supports Standard Schema style libraries through `xsschema`, including:

- Zod
- Valibot
- ArkType
- Effect

Use these when the user wants typed structured output.
Some schema vendors need an extra JSON Schema converter package in the project:

- Zod v3: `zod-to-json-schema`
- Valibot: `@valibot/to-json-schema`

## `generateObject`

Use `generateObject` when the user wants a validated final object.

Important options:

- `schema`
- `schemaName`
- `schemaDescription`
- `strict`
- optional `output: 'array'`

## `streamObject`

Use `streamObject` when the user wants incremental parsing.

Important result shapes:

- object mode: `partialObjectStream`
- array mode: `elementStream`

`streamObject` is async because schema conversion happens before the text stream starts.

## Tool helpers

- `tool()`: use with Standard Schema libraries
- `rawTool()`: use with raw JSON Schema

Use `tool()` when the user already has a schema library in the project.
Use `rawTool()` when the user already has JSON Schema or wants zero schema-library coupling.

## Recommendation rules

- Prefer `generateObject` over asking the model for free-form JSON.
- Prefer `streamObject` when the UI or workflow benefits from partial structured output.
- Prefer `tool()` unless the user explicitly needs raw JSON Schema.
