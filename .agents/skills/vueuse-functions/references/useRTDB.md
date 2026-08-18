---
category: '@Firebase'
---

# useRTDB

Reactive [Firebase Realtime Database](https://firebase.google.com/docs/database) binding. Making it straightforward to **always keep your local data in sync** with remotes databases.

## Usage

```ts
import { useRTDB } from '@vueuse/firebase/useRTDB'
import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const app = initializeApp({ /* config */ })
const db = getDatabase(app)

// in setup()
const todos = useRTDB(db.ref('todos'))
```

## Options

| Option         | Type                   | Default         | Description                                               |
| -------------- | ---------------------- | --------------- | --------------------------------------------------------- |
| `autoDispose`  | `boolean`              | `true`          | Automatically unsubscribe when the component is unmounted |
| `errorHandler` | `(err: Error) => void` | `console.error` | Custom error handler for database errors                  |

## Return Value

Returns a `Ref<T | undefined>` that is automatically updated when the database value changes.

## Reusing Database References

You can reuse the db reference by passing `autoDispose: false`

```ts
const todos = useRTDB(db.ref('todos'), { autoDispose: false })
```

or use `createGlobalState` from the core package

```ts twoslash include store
// @filename: store.ts
// ---cut---
// store.ts
import { createGlobalState } from '@vueuse/core'
import { useRTDB } from '@vueuse/firebase/useRTDB'

export const useTodos = createGlobalState(
  () => useRTDB(db.ref('todos')),
)
```

```vue
<!-- app.vue -->
<script setup lang="ts">
// @include: store
// ---cut---
import { useTodos } from './store'

const todos = useTodos()
</script>
```

## Type Declarations

```ts
export interface UseRTDBOptions {
  errorHandler?: (err: Error) => void
  autoDispose?: boolean
}
/**
 * Reactive Firebase Realtime Database binding.
 *
 * @see https://vueuse.org/useRTDB
 */
export declare function useRTDB<T = any>(
  docRef: DatabaseReference,
  options?: UseRTDBOptions,
): Ref<T | undefined, T | undefined>
```
