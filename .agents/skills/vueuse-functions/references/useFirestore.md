---
category: '@Firebase'
---

# useFirestore

Reactive [Firestore](https://firebase.google.com/docs/firestore) binding. Making it straightforward to **always keep your local data in sync** with remotes databases.

## Usage

```ts {9,12,17,22}
import { useFirestore } from '@vueuse/firebase/useFirestore'
import { initializeApp } from 'firebase/app'
import { collection, doc, getFirestore, limit, orderBy, query } from 'firebase/firestore'
import { computed, shallowRef } from 'vue'

const app = initializeApp({ projectId: 'MY PROJECT ID' })
const db = getFirestore(app)

const todos = useFirestore(collection(db, 'todos'))

// or for doc reference
const user = useFirestore(doc(db, 'users', 'my-user-id'))

// you can also use ref value for reactive query
const postsLimit = shallowRef(10)
const postsQuery = computed(() => query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(postsLimit.value)))
const posts = useFirestore(postsQuery)

// you can use the boolean value to tell a query when it is ready to run
// when it gets falsy value, return the initial value
const userId = shallowRef('')
const userQuery = computed(() => userId.value && doc(db, 'users', userId.value))
const userData = useFirestore(userQuery, null)
```

### Return Value

- For **Document Reference**: Returns `Ref<T | null>` (single document with `id` property)
- For **Query**: Returns `Ref<T[]>` (array of documents, each with `id` property)

The document `id` is automatically added as a read-only property to each returned document.

### Options

| Option         | Type                   | Default         | Description                                                                |
| -------------- | ---------------------- | --------------- | -------------------------------------------------------------------------- |
| `errorHandler` | `(err: Error) => void` | `console.error` | Custom error handler                                                       |
| `autoDispose`  | `boolean \| number`    | `true`          | Auto-unsubscribe on scope dispose. Pass a number for delayed dispose (ms). |

### Error Handling

```ts
const todos = useFirestore(collection(db, 'todos'), [], {
  errorHandler: (err) => {
    console.error('Firestore error:', err)
    // Handle error (e.g., show notification)
  },
})
```

## Share across instances

You can reuse the db reference by passing `autoDispose: false`. You can also set an amount of milliseconds before auto disposing the db reference.

Note : Getting a not disposed db reference again don't cost a Firestore read.

```ts
import { useFirestore } from '@vueuse/firebase/useFirestore'
import { collection } from 'firebase/firestore'
// ---cut---
const todos = useFirestore(collection(db, 'todos'), undefined, { autoDispose: false })
```

or use `createGlobalState` from the core package

```ts twoslash include store
// @filename: store.ts
// ---cut---
// store.ts
import { createGlobalState } from '@vueuse/core'
import { useFirestore } from '@vueuse/firebase/useFirestore'

export const useTodos = createGlobalState(
  () => useFirestore(collection(db, 'todos')),
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
export interface UseFirestoreOptions {
  errorHandler?: (err: Error) => void
  autoDispose?: boolean | number
}
export type FirebaseDocRef<T> = Query<T> | DocumentReference<T>
type Falsy = false | 0 | "" | null | undefined
export declare function useFirestore<T extends DocumentData>(
  maybeDocRef: MaybeRef<DocumentReference<T> | Falsy>,
  initialValue: T,
  options?: UseFirestoreOptions,
): Ref<T | null>
export declare function useFirestore<T extends DocumentData>(
  maybeDocRef: MaybeRef<Query<T> | Falsy>,
  initialValue: T[],
  options?: UseFirestoreOptions,
): Ref<T[]>
export declare function useFirestore<T extends DocumentData>(
  maybeDocRef: MaybeRef<DocumentReference<T> | Falsy>,
  initialValue?: T | undefined | null,
  options?: UseFirestoreOptions,
): Ref<T | undefined | null>
export declare function useFirestore<T extends DocumentData>(
  maybeDocRef: MaybeRef<Query<T> | Falsy>,
  initialValue?: T[],
  options?: UseFirestoreOptions,
): Ref<T[] | undefined>
```
