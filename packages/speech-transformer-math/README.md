# @proj-airi/speech-transformer-math

Reads TeX formulas as words for a listener, in Chinese, English, Japanese, and Korean. It is a rule system. It has no
speech pipeline, no model, and no network, so any project can use it.

## Use it for

- Text for a TTS voice from a TeX formula: `new MathSpeech().speak(tex, language)`.
- The meaning of a formula as MathJSON, without words: `speech.toMathJson(tex)`.
- A new language, or new words for a language: a locale pack (`MathLocale`).
- New notation, for example chemistry: an extension (`MathSpeechExtension`).

## Do not use it for

- Finding formulas in markdown or prose. `@proj-airi/core-agent` does that before it calls this package.
- Evaluating or simplifying formulas.
- mhchem chemistry alone. Add `@proj-airi/speech-transformer-chem` as an extension.

## Usage

```ts
import { MathSpeech } from '@proj-airi/speech-transformer-math'

const speech = new MathSpeech()
speech.speak('x^2', 'en') // => 'x squared'
speech.speak('x^2', 'zh-CN') // => 'x的平方'
```

The language is a BCP 47 code. A language without a pack is read by the fallback pack, English by default.

Each instance owns its packs and extensions. `register(pack)` adds a pack or replaces the pack of its language, and
returns a function that restores the earlier pack.

## Layers

1. `parseMath`: KaTeX parses the formula, and the parse tree becomes a small syntax tree. Raw commands of extensions
   keep their source.
2. `lowerMath`: the syntax tree becomes MathJSON. This layer holds every rule of meaning, for example a derivative or
   an interval.
3. Extensions lower their raw commands.
4. `renderMath`: MathJSON becomes the words of one language. This layer holds only the wording.

## Extensions

```ts
const shout: MathSpeechExtension = {
  name: 'shout',
  rawCommands: ['shout'],
  lower: (_, source) => ['Shout', `'${source}'`],
  render: { Shout: ([, value]) => String(value).slice(1, -1).toUpperCase() },
}
new MathSpeech({ extensions: [shout] }).speak(String.raw`x = \shout{hi}`, 'en') // => 'x equals HI'
```

## Tests

The tests of each language are next to its pack, for example `src/locales/ko.test.ts`. Tests of a layer are next to
the layer, for example `src/lower.test.ts`.

## Checks

```sh
pnpm -F @proj-airi/speech-transformer-math typecheck
pnpm -F @proj-airi/speech-transformer-math exec vitest run
```
