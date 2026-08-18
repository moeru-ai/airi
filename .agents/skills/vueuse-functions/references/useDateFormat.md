---
category: Time
---

# useDateFormat

Get the formatted date according to the string of tokens passed in, inspired
by [dayjs](https://github.com/iamkun/dayjs).

**List of all available formats (HH:mm:ss by default):**

| Format | Output                   | Description                             |
| ------ | ------------------------ | --------------------------------------- |
| `Yo`   | 2018th                   | Ordinal formatted year                  |
| `YY`   | 18                       | Two-digit year                          |
| `YYYY` | 2018                     | Four-digit year                         |
| `M`    | 1-12                     | The month, beginning at 1               |
| `Mo`   | 1st, 2nd, ..., 12th      | The month, ordinal formatted            |
| `MM`   | 01-12                    | The month, 2-digits                     |
| `MMM`  | Jan-Dec                  | The abbreviated month name              |
| `MMMM` | January-December         | The full month name                     |
| `D`    | 1-31                     | The day of the month                    |
| `Do`   | 1st, 2nd, ..., 31st      | The day of the month, ordinal formatted |
| `DD`   | 01-31                    | The day of the month, 2-digits          |
| `H`    | 0-23                     | The hour                                |
| `Ho`   | 0th, 1st, 2nd, ..., 23rd | The hour, ordinal formatted             |
| `HH`   | 00-23                    | The hour, 2-digits                      |
| `h`    | 1-12                     | The hour, 12-hour clock                 |
| `ho`   | 1st, 2nd, ..., 12th      | The hour, 12-hour clock, sorted         |
| `hh`   | 01-12                    | The hour, 12-hour clock, 2-digits       |
| `m`    | 0-59                     | The minute                              |
| `mo`   | 0th, 1st, ..., 59th      | The minute, ordinal formatted           |
| `mm`   | 00-59                    | The minute, 2-digits                    |
| `s`    | 0-59                     | The second                              |
| `so`   | 0th, 1st, ..., 59th      | The second, ordinal formatted           |
| `ss`   | 00-59                    | The second, 2-digits                    |
| `SSS`  | 000-999                  | The millisecond, 3-digits               |
| `A`    | AM PM                    | The meridiem                            |
| `AA`   | A.M. P.M.                | The meridiem, periods                   |
| `a`    | am pm                    | The meridiem, lowercase                 |
| `aa`   | a.m. p.m.                | The meridiem, lowercase and periods     |
| `d`    | 0-6                      | The day of the week, with Sunday as 0   |
| `dd`   | S-S                      | The min name of the day of the week     |
| `ddd`  | Sun-Sat                  | The short name of the day of the week   |
| `dddd` | Sunday-Saturday          | The name of the day of the week         |
| `z`    | GMT, GMT+1               | The timezone with offset                |
| `zz`   | GMT, GMT+1               | The timezone with offset                |
| `zzz`  | GMT, GMT+1               | The timezone with offset                |
| `zzzz` | GMT, GMT+01:00           | The long timezone with offset           |

- Meridiem is customizable by defining `customMeridiem` in `options`.

## Usage

### Basic

```vue
<script setup lang="ts">
import { useDateFormat, useNow } from '@vueuse/core'

const formatted = useDateFormat(useNow(), 'YYYY-MM-DD HH:mm:ss')
</script>

<template>
  <div>{{ formatted }}</div>
</template>
```

### Use with locales

```vue
<script setup lang="ts">
import { useDateFormat, useNow } from '@vueuse/core'

const formatted = useDateFormat(useNow(), 'YYYY-MM-DD (ddd)', { locales: 'en-US' })
</script>

<template>
  <div>{{ formatted }}</div>
</template>
```

### Use with custom meridiem

```vue
<script setup lang="ts">
import { useDateFormat } from '@vueuse/core'

function customMeridiem(hours: number, minutes: number, isLowercase?: boolean, hasPeriod?: boolean) {
  const m = hours > 11 ? (isLowercase ? 'μμ' : 'ΜΜ') : (isLowercase ? 'πμ' : 'ΠΜ')
  return hasPeriod ? m.split('').reduce((acc, current) => acc += `${current}.`, '') : m
}

const am = useDateFormat('2022-01-01 05:05:05', 'hh:mm:ss A', { customMeridiem })
// am.value = '05:05:05 ΠΜ'
const pm = useDateFormat('2022-01-01 17:05:05', 'hh:mm:ss AA', { customMeridiem })
// pm.value = '05:05:05 Μ.Μ.'
</script>
```

## Type Declarations

```ts
export type DateLike = Date | number | string | undefined
export interface UseDateFormatOptions {
  /**
   * The locale(s) to used for dd/ddd/dddd/MMM/MMMM format
   *
   * [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl#locales_argument).
   */
  locales?: MaybeRefOrGetter<Intl.LocalesArgument>
  /**
   * A custom function to re-modify the way to display meridiem
   *
   */
  customMeridiem?: (
    hours: number,
    minutes: number,
    isLowercase?: boolean,
    hasPeriod?: boolean,
  ) => string
}
export declare function formatDate(
  date: Date,
  formatStr: string,
  options?: UseDateFormatOptions,
): string
export declare function normalizeDate(date: DateLike): Date
export type UseDateFormatReturn = ComputedRef<string>
/**
 * Get the formatted date according to the string of tokens passed in.
 *
 * @see https://vueuse.org/useDateFormat
 * @param date - The date to format, can either be a `Date` object, a timestamp, or a string
 * @param formatStr - The combination of tokens to format the date
 * @param options - UseDateFormatOptions
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useDateFormat(
  date: MaybeRefOrGetter<DateLike>,
  formatStr?: MaybeRefOrGetter<string>,
  options?: UseDateFormatOptions,
): UseDateFormatReturn
```
