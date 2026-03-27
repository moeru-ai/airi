---
category: '@Router'
---

# useRouteParams

Shorthand for a reactive `route.params`.

## Usage

```ts
import { useRouteParams } from '@vueuse/router'

const userId = useRouteParams('userId')

const userId = useRouteParams('userId', '-1') // or with a default value

const userId = useRouteParams('page', '1', { transform: Number }) // or transforming value

console.log(userId.value) // route.params.userId
userId.value = '100' // router.replace({ params: { userId: '100' } })
```

## Type Declarations

```ts
export declare function useRouteParams(
  name: string,
): Ref<null | string | string[]>
export declare function useRouteParams<
  T extends RouteParamValueRaw = RouteParamValueRaw,
  K = T,
>(
  name: string,
  defaultValue?: MaybeRefOrGetter<T>,
  options?: ReactiveRouteOptionsWithTransform<T, K>,
): Ref<K>
```
