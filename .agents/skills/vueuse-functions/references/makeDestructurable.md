---
category: Utilities
---

# makeDestructurable

Make isomorphic destructurable for object and array at the same time. See [this blog](https://antfu.me/posts/destructuring-with-object-or-array/) for more details.

## Usage

TypeScript Example:

```ts twoslash include main
import { makeDestructurable } from '@vueuse/core'

const foo = { name: 'foo' }
const bar = 1024

const obj = makeDestructurable(
  { foo, bar } as const,
  [foo, bar] as const,
)
```

Usage:

```ts twoslash
// @include: main
// ---cut---
let { foo, bar } = obj
let [foo, bar] = obj
```

## Type Declarations

```ts
export declare function makeDestructurable<
  T extends Record<string, unknown>,
  A extends readonly any[],
>(obj: T, arr: A): T & A
```
