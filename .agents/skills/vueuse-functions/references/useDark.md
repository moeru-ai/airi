---
category: Browser
related:
  - useColorMode
  - usePreferredDark
  - useStorage
---

# useDark

Reactive dark mode with auto data persistence.

<CourseLink href="https://vueschool.io/lessons/theming-with-vueuse-usedark-and-usecolormode?friend=vueuse">Learn useDark with this FREE video lesson from Vue School!</CourseLink>

## Basic Usage

```ts
import { useDark, useToggle } from '@vueuse/core'

const isDark = useDark()
const toggleDark = useToggle(isDark)
```

## Behavior

`useDark` combines with `usePreferredDark` and `useStorage`. On start up, it reads the value from localStorage/sessionStorage (the key is configurable) to see if there is a user configured color scheme, if not, it will use users' system preferences. When you change the `isDark` ref, it will update the corresponding element's attribute and then store the preference to storage (default key: `vueuse-color-scheme`) for persistence.

> Please note `useDark` only handles the DOM attribute changes for you to apply proper selector in your CSS. It does NOT handle the actual style, theme or CSS for you.

## Configuration

By default, it uses [Tailwind CSS favored dark mode](https://tailwindcss.com/docs/dark-mode#toggling-dark-mode-manually), which enables dark mode when class `dark` is applied to the `html` tag, for example:

```html
<!--light-->
<html>
  ...
</html>

<!--dark-->
<html class="dark">
  ...
</html>
```

Still, you can also customize it to make it work with most CSS frameworks.

For example:

```ts
import { useDark } from '@vueuse/core'
// ---cut---
const isDark = useDark({
  selector: 'body',
  attribute: 'color-scheme',
  valueDark: 'dark',
  valueLight: 'light',
})
```

will work like

```html
<!--light-->
<html>
  <body color-scheme="light">
    ...
  </body>
</html>

<!--dark-->
<html>
  <body color-scheme="dark">
    ...
  </body>
</html>
```

If the configuration above still does not fit your needs, you can use the`onChanged` option to take full control over how you handle updates.

```ts
import { useDark } from '@vueuse/core'
// ---cut---
const isDark = useDark({
  onChanged(dark) {
    // update the dom, call the API or something
  },
})
```

## Component Usage

```vue
<template>
  <UseDark v-slot="{ isDark, toggleDark }">
    <button @click="toggleDark()">
      Is Dark: {{ isDark }}
    </button>
  </UseDark>
</template>
```

## Type Declarations

```ts
export interface UseDarkOptions extends Omit<
  UseColorModeOptions<BasicColorSchema>,
  "modes" | "onChanged"
> {
  /**
   * Value applying to the target element when isDark=true
   *
   * @default 'dark'
   */
  valueDark?: string
  /**
   * Value applying to the target element when isDark=false
   *
   * @default ''
   */
  valueLight?: string
  /**
   * A custom handler for handle the updates.
   * When specified, the default behavior will be overridden.
   *
   * @default undefined
   */
  onChanged?: (
    isDark: boolean,
    defaultHandler: (mode: BasicColorSchema) => void,
    mode: BasicColorSchema,
  ) => void
}
export type UseDarkReturn = WritableComputedRef<boolean>
/**
 * Reactive dark mode with auto data persistence.
 *
 * @see https://vueuse.org/useDark
 * @param options
 */
export declare function useDark(options?: UseDarkOptions): UseDarkReturn
```
