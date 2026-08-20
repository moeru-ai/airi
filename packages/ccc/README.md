# @proj-airi/ccc

Character Card protocol primitives for AIRI.

## What it owns

- CCv3 JSON envelope validation and compatibility classification.
- Forward-compatible preservation of unknown fields during validation.
- Shared CCv3 TypeScript contracts.
- Character Card JSON, Markdown, PNG, and APNG export helpers.

The package is intentionally runtime-agnostic. It does not own AIRI module
settings, local persistence, chat message assembly, or editor behavior.

## Parse a CCv3 document

```ts
import { parseCharacterCardV3 } from '@proj-airi/ccc'

const { card, compatibility } = parseCharacterCardV3(jsonText)

const characterName = card.data.name
const versionSupport = compatibility // 'older' | 'current' | 'newer'
```

The parser accepts either decoded JSON data or JSON text. Older and newer
`spec_version` values remain importable, while `compatibility` lets the caller
decide whether to warn the user. Unknown keys are preserved on the validated
output so future CCv3 fields are not silently deleted.

Malformed JSON and invalid CCv3 structures throw
`InvalidCharacterCardError`. Use `isInvalidCharacterCardError` when a boundary
needs to distinguish protocol failures from storage or filesystem errors.

## When to use it

- Importing or exporting community Character Cards.
- Validating a CCv3 envelope before converting it into an application model.
- Building format adapters such as PNG, APNG, or CHARX.

## When not to use it

- Persisting AIRI-specific active-card state.
- Applying speech, vision, body-model, or agent configuration.
- Constructing provider messages from prompts, greetings, examples, or a
  Lorebook.

Those policies belong to AIRI's character runtime rather than the community
protocol codec.

## License

[MIT](./LICENSE)
