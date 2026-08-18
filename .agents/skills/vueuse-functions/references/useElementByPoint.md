---
category: Sensors
---

# useElementByPoint

Reactive element by point.

## Usage

```ts
import { useElementByPoint, useMouse } from '@vueuse/core'

const { x, y } = useMouse({ type: 'client' })
const { element } = useElementByPoint({ x, y })
```

## Type Declarations

```ts
export interface UseElementByPointOptions<Multiple extends boolean = false>
  extends ConfigurableDocument, ConfigurableScheduler {
  x: MaybeRefOrGetter<number>
  y: MaybeRefOrGetter<number>
  multiple?: MaybeRefOrGetter<Multiple>
  /** @deprecated Please use `scheduler` option instead */
  immediate?: boolean
  /** @deprecated Please use `scheduler` option instead */
  interval?: "requestAnimationFrame" | number
}
export interface UseElementByPointReturn<Multiple extends boolean = false>
  extends Supportable, Pausable {
  element: ShallowRef<
    Multiple extends true ? HTMLElement[] : HTMLElement | null
  >
}
/**
 * Reactive element by point.
 *
 * @see https://vueuse.org/useElementByPoint
 * @param options - UseElementByPointOptions
 */
export declare function useElementByPoint<M extends boolean = false>(
  options: UseElementByPointOptions<M>,
): UseElementByPointReturn<M>
```
