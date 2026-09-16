---
category: Time
---

# useTimeAgoIntl

Reactive time ago with i18n supported. Automatically update the time ago string when the time changes. Powered by `Intl.RelativeTimeFormat`.

## Usage

```js
import { useTimeAgoIntl } from '@vueuse/core'

const timeAgoIntl = useTimeAgoIntl(new Date(2021, 0, 1))
```

## Non-Reactivity Usage

In case you don't need the reactivity, you can use the `formatTimeAgo` function to get the formatted string instead of a Ref.

```js
import { formatTimeAgoIntl } from '@vueuse/core'

const timeAgoIntl = formatTimeAgoIntl(new Date(2021, 0, 1)) // string
```

## Type Declarations

```ts
type Locale = Intl.UnicodeBCP47LocaleIdentifier | Intl.Locale
export interface FormatTimeAgoIntlOptions {
  /**
   * The locale to format with
   *
   * @default undefined
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/RelativeTimeFormat#locales
   */
  locale?: Locale
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/RelativeTimeFormat#options
   */
  relativeTimeFormatOptions?: Intl.RelativeTimeFormatOptions
  /**
   * Whether to insert spaces between parts.
   *
   * Ignored if `joinParts` is provided.
   *
   * @default true
   */
  insertSpace?: boolean
  /**
   * Custom function to join the parts returned by `Intl.RelativeTimeFormat.formatToParts`.
   *
   * If provided, it will be used instead of the default join logic.
   */
  joinParts?: (
    parts: Intl.RelativeTimeFormatPart[],
    locale?: Intl.UnicodeBCP47LocaleIdentifier | Intl.Locale,
  ) => string
  /**
   * Custom units
   */
  units?: TimeAgoUnit[]
}
export interface UseTimeAgoIntlOptions<Controls extends boolean>
  extends FormatTimeAgoIntlOptions, ConfigurableScheduler {
  /**
   * Expose more controls and the raw `parts` result.
   *
   * @default false
   */
  controls?: Controls
  /**
   * Update interval in milliseconds, set 0 to disable auto update
   *
   * @deprecated Please use `scheduler` option instead
   * @default 30_000
   */
  updateInterval?: number
}
type UseTimeAgoReturn<Controls extends boolean = false> = Controls extends true
  ? {
      timeAgoIntl: ComputedRef<string>
      parts: ComputedRef<Intl.RelativeTimeFormatPart[]>
    } & Pausable
  : ComputedRef<string>
export interface TimeAgoUnit {
  name: Intl.RelativeTimeFormatUnit
  ms: number
}
/**
 * A reactive wrapper for `Intl.RelativeTimeFormat`.
 */
export declare function useTimeAgoIntl(
  time: MaybeRefOrGetter<Date | number | string>,
  options?: UseTimeAgoIntlOptions<false>,
): UseTimeAgoReturn<false>
export declare function useTimeAgoIntl(
  time: MaybeRefOrGetter<Date | number | string>,
  options: UseTimeAgoIntlOptions<true>,
): UseTimeAgoReturn<true>
/**
 * Non-reactive version of useTimeAgoIntl
 */
export declare function formatTimeAgoIntl(
  from: Date,
  options?: FormatTimeAgoIntlOptions,
  now?: Date | number,
): string
/**
 * Format parts into a string
 */
export declare function formatTimeAgoIntlParts(
  parts: Intl.RelativeTimeFormatPart[],
  options?: FormatTimeAgoIntlOptions,
): string
```
