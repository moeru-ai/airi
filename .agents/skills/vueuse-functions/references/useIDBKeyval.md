---
category: '@Integrations'
---

# useIDBKeyval

Wrapper for [`idb-keyval`](https://www.npmjs.com/package/idb-keyval).

## Install idb-keyval as a peer dependency

```bash
npm install idb-keyval@^6
```

## Usage

```ts
import { useIDBKeyval } from '@vueuse/integrations/useIDBKeyval'

// bind object
const { data: storedObject, isFinished } = useIDBKeyval('my-idb-keyval-store', { hello: 'hi', greeting: 'Hello' })

// update object
storedObject.value.hello = 'hola'

// bind boolean
const flag = useIDBKeyval('my-flag', true) // returns Ref<boolean>

// bind number
const count = useIDBKeyval('my-count', 0) // returns Ref<number>

// awaiting IDB transaction
await count.set(10)
console.log('IDB transaction finished!')

// delete data from idb storage
storedObject.value = null
```

## Type Declarations

```ts
interface Serializer<T> {
  read: (raw: unknown) => T
  write: (value: T) => unknown
}
export interface UseIDBOptions<T> extends ConfigurableFlush {
  /**
   * Watch for deep changes
   *
   * @default true
   */
  deep?: boolean
  /**
   * On error callback
   *
   * Default log error to `console.error`
   */
  onError?: (error: unknown) => void
  /**
   * Use shallow ref as reference
   *
   * @default false
   */
  shallow?: boolean
  /**
   * Write the default value to the storage when it does not exist
   *
   * @default true
   */
  writeDefaults?: boolean
  /**
   * Custom data serialization
   */
  serializer?: Serializer<T>
}
export interface UseIDBKeyvalReturn<T> {
  data: RemovableRef<T>
  isFinished: ShallowRef<boolean>
  set: (value: T) => Promise<void>
}
/**
 *
 * @param key
 * @param initialValue
 * @param options
 */
export declare function useIDBKeyval<T>(
  key: IDBValidKey,
  initialValue: MaybeRefOrGetter<T>,
  options?: UseIDBOptions<T>,
): UseIDBKeyvalReturn<T>
```
