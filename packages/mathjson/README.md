# @proj-airi/mathjson

Types and small helpers for the MathJSON of the speech transformers. The package has no dependency.

## Use it for

- The type of a lowered formula: `MathJson`, `MathJsonFunction`, and `MathJsonNumber`.
- Reading or building nodes: `headOf`, `argsOf`, `isFunction`, `isNumber`, `isSymbol`, `text`, `textOf`, and `nothing`.

## Do not use it for

- Parsing or reading formulas. Use `@proj-airi/speech-transformer-math`.
- Full MathJSON with evaluation. Use `@cortex-js/compute-engine`.

## Shape

The shape follows [MathJSON](https://mathlive.io/math-json/). A function is an array with its head first, a string is a
symbol, and a quoted string, for example `'kg'`, is text. The speech transformers add heads for reading, for example
`Apply`, `Bracket`, and `Chemistry`.

```ts
const expression: MathJson = ['Add', 'x', { num: '1' }]
headOf(expression) // => 'Add'
```

## Checks

```sh
pnpm -F @proj-airi/mathjson typecheck
```
