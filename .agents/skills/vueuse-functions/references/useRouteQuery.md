---
category: '@Router'
---

# useRouteQuery

Shorthand for a reactive `route.query`. Updates the URL query parameters when the ref changes.

## Usage

```ts
import { useRouteQuery } from '@vueuse/router'

const search = useRouteQuery('search')

const search = useRouteQuery('search', 'foo') // or with a default value

const page = useRouteQuery('page', '1', { transform: Number }) // or transforming value

console.log(search.value) // route.query.search
search.value = 'foobar' // router.replace({ query: { search: 'foobar' } })
```

### Navigation Mode

By default, changes use `router.replace()`. Set `mode: 'push'` to use `router.push()` instead.

```ts
import { useRouteQuery } from '@vueuse/router'

const search = useRouteQuery('search', '', { mode: 'push' })
```

### Bidirectional Transform

You can provide separate `get` and `set` transforms for reading and writing values.

```ts
import { useRouteQuery } from '@vueuse/router'

const filters = useRouteQuery('filters', [], {
  transform: {
    get: v => v ? v.split(',') : [],
    set: v => v.join(','),
  },
})

// Reading: 'a,b,c' -> ['a', 'b', 'c']
// Writing: ['a', 'b', 'c'] -> 'a,b,c'
```

### Default Value Behavior

When the value equals the default value, the query parameter is removed from the URL.

```ts
import { useRouteQuery } from '@vueuse/router'

const page = useRouteQuery('page', '1')

page.value = '2' // URL: ?page=2
page.value = '1' // URL: (no page param, since it equals default)
```

## Type Declarations

```ts
export declare function useRouteQuery(
  name: string,
): Ref<undefined | null | string | string[]>
export declare function useRouteQuery<
  T extends RouteQueryValueRaw = RouteQueryValueRaw,
  K = T,
>(
  name: string,
  defaultValue?: MaybeRefOrGetter<T>,
  options?: ReactiveRouteOptionsWithTransform<T, K>,
): Ref<K>
```
