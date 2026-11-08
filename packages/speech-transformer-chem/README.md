# @proj-airi/speech-transformer-chem

Reads mhchem `\ce{}` and `\pu{}` as chemistry for a listener, in Chinese, English, Japanese, and Korean. It is an
extension of `@proj-airi/speech-transformer-math`.

## Use it for

- Chemical formulas and equations in a reply that a TTS voice reads: `chemistry()`.
- New words of chemistry for a language: a chemistry locale (`ChemLocale`).

## Do not use it for

- Formulas without `\ce{}` or `\pu{}`. The math transformer reads them.
- Naming any compound. The names cover the formulas of school chemistry. Other formulas keep their symbols.

## Usage

```ts
import { chemistry } from '@proj-airi/speech-transformer-chem'
import { MathSpeech } from '@proj-airi/speech-transformer-math'

const speech = new MathSpeech({ extensions: [chemistry()] })
speech.speak(String.raw`\ce{2H2 + O2 -> 2H2O}`, 'zh') // => '氢气 和 氧气 反应生成 水'
```

Install `@proj-airi/speech-transformer-math` too. It is a peer dependency, so the reader and the extension share one
`MathSpeech`.

A chemistry locale matches the math locale pack by its language. A language without one is read by the fallback
locale, English by default.

- Chinese, Japanese, and Korean read the species of an equation by their names, as a textbook does.
- English reads the symbols, for example "H two O".
- The built-in locales are exported as `zhChem`, `enChem`, `jaChem`, and `koChem`, apart from the math packs.
- Chinese, Japanese, and Korean do not read coefficients. A substance has no count, so 2个氢气 is wrong, and 分子 or
  분자 is wrong for metals, ionic solids, and ions.

## Tests

The tests of each language are next to its locale, for example `src/locales/ja.test.ts`.

## Checks

```sh
pnpm -F @proj-airi/speech-transformer-chem typecheck
pnpm -F @proj-airi/speech-transformer-chem exec vitest run
```
