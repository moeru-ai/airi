---
category: Time
---

# useTimeAgo

Reactive time ago. Automatically update the time ago string when the time changes.

## Usage

```ts
import { useTimeAgo } from '@vueuse/core'

const timeAgo = useTimeAgo(new Date(2021, 0, 1))
```

## Component Usage

```vue
<template>
  <UseTimeAgo v-slot="{ timeAgo }" :time="new Date(2021, 0, 1)">
    Time Ago: {{ timeAgo }}
  </UseTimeAgo>
</template>
```

## Non-Reactivity Usage

In case you don't need the reactivity, you can use the `formatTimeAgo` function to get the formatted string instead of a Ref.

```ts
import { formatTimeAgo } from '@vueuse/core'

const timeAgo = formatTimeAgo(new Date(2021, 0, 1)) // string
```

## Type Declarations

```ts
export type UseTimeAgoFormatter<T = number> = (
  value: T,
  isPast: boolean,
) => string
export type UseTimeAgoUnitNamesDefault =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year"
export interface UseTimeAgoMessagesBuiltIn {
  justNow: string
  past: string | UseTimeAgoFormatter<string>
  future: string | UseTimeAgoFormatter<string>
  invalid: string
}
export type UseTimeAgoMessages<
  UnitNames extends string = UseTimeAgoUnitNamesDefault,
> = UseTimeAgoMessagesBuiltIn &
  Record<UnitNames, string | UseTimeAgoFormatter<number>>
export interface FormatTimeAgoOptions<
  UnitNames extends string = UseTimeAgoUnitNamesDefault,
> {
  /**
   * Maximum unit (of diff in milliseconds) to display the full date instead of relative
   *
   * @default undefined
   */
  max?: UnitNames | number
  /**
   * Formatter for full date
   */
  fullDateFormatter?: (date: Date) => string
  /**
   * Messages for formatting the string
   */
  messages?: UseTimeAgoMessages<UnitNames>
  /**
   * Minimum display time unit (default is minute)
   *
   * @default false
   */
  showSecond?: boolean
  /**
   * Rounding method to apply.
   *
   * @default 'round'
   */
  rounding?: "round" | "ceil" | "floor" | number
  /**
   * Custom units
   */
  units?: UseTimeAgoUnit<UnitNames>[]
}
export interface UseTimeAgoOptions<
  Controls extends boolean,
  UnitNames extends string = UseTimeAgoUnitNamesDefault,
>
  extends FormatTimeAgoOptions<UnitNames>, ConfigurableScheduler {
  /**
   * Expose more controls
   *
   * @default false
   */
  controls?: Controls
  /**
   * Intervals to update, set 0 to disable auto update
   *
   * @deprecated Please use `scheduler` option instead
   * @default 30_000
   */
  updateInterval?: number
}
export interface UseTimeAgoUnit<
  Unit extends string = UseTimeAgoUnitNamesDefault,
> {
  max: number
  value: number
  name: Unit
}
export type UseTimeAgoReturn<Controls extends boolean = false> =
  Controls extends true
    ? {
        timeAgo: ComputedRef<string>
      } & Pausable
    : ComputedRef<string>
/**
 * Reactive time ago formatter.
 *
 * @see https://vueuse.org/useTimeAgo
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useTimeAgo<
  UnitNames extends string = UseTimeAgoUnitNamesDefault,
>(
  time: MaybeRefOrGetter<Date | number | string>,
  options?: UseTimeAgoOptions<false, UnitNames>,
): UseTimeAgoReturn<false>
export declare function useTimeAgo<
  UnitNames extends string = UseTimeAgoUnitNamesDefault,
>(
  time: MaybeRefOrGetter<Date | number | string>,
  options: UseTimeAgoOptions<true, UnitNames>,
): UseTimeAgoReturn<true>
export declare function formatTimeAgo<
  UnitNames extends string = UseTimeAgoUnitNamesDefault,
>(
  from: Date,
  options?: FormatTimeAgoOptions<UnitNames>,
  now?: Date | number,
): string
```
