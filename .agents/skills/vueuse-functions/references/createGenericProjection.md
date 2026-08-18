---
category: '@Math'
---

# createGenericProjection

Generic version of `createProjection`. Accepts a custom projector function to map arbitrary type of domains.

Refer to `createProjection` and `useProjection`

## Type Declarations

```ts
export type ProjectorFunction<F, T> = (
  input: F,
  from: readonly [F, F],
  to: readonly [T, T],
) => T
export type UseProjection<F, T> = (input: MaybeRefOrGetter<F>) => ComputedRef<T>
export declare function createGenericProjection<F = number, T = number>(
  fromDomain: MaybeRefOrGetter<readonly [F, F]>,
  toDomain: MaybeRefOrGetter<readonly [T, T]>,
  projector: ProjectorFunction<F, T>,
): UseProjection<F, T>
```
