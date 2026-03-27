---
category: Utilities
---

# useToggle

A boolean switcher with utility functions.

## Usage

```ts
import { useToggle } from '@vueuse/core'

const [value, toggle] = useToggle()
```

When you pass a ref, `useToggle` will return a simple toggle function instead:

```ts
import { useDark, useToggle } from '@vueuse/core'

const isDark = useDark()
const toggleDark = useToggle(isDark)
```

### Toggle Function

The toggle function can be called in two ways:

```ts
const [value, toggle] = useToggle()

toggle() // toggle between true and false
toggle(true) // set to specific value

// The toggle function returns the new value
const newValue = toggle() // returns the new value after toggling
```

### Custom Values

You can use custom truthy and falsy values instead of `true` and `false`:

```ts
import { useToggle } from '@vueuse/core'

const [value, toggle] = useToggle('on', {
  truthyValue: 'on',
  falsyValue: 'off',
})

toggle() // 'off'
toggle() // 'on'
```

The custom values can also be reactive:

```ts
import { useToggle } from '@vueuse/core'
import { ref } from 'vue'

const truthy = ref('yes')
const falsy = ref('no')

const [value, toggle] = useToggle('yes', {
  truthyValue: truthy,
  falsyValue: falsy,
})
```

## Caution

Be aware that the toggle function accepts the first argument as the override value. You might want to avoid directly passing the function to events in the template, as the event object will be passed in.

```html
<!-- caution: $event will be passed in -->
<button @click="toggleDark" />
<!-- recommended to do this -->
<button @click="toggleDark()" />
```

## Type Declarations

```ts
export type ToggleFn = (value?: boolean) => void
export type UseToggleReturn = [ShallowRef<boolean>, ToggleFn] | ToggleFn
export interface UseToggleOptions<Truthy, Falsy> {
  truthyValue?: MaybeRefOrGetter<Truthy>
  falsyValue?: MaybeRefOrGetter<Falsy>
}
export declare function useToggle<Truthy, Falsy, T = Truthy | Falsy>(
  initialValue: Ref<T>,
  options?: UseToggleOptions<Truthy, Falsy>,
): (value?: T) => T
export declare function useToggle<
  Truthy = true,
  Falsy = false,
  T = Truthy | Falsy,
>(
  initialValue?: T,
  options?: UseToggleOptions<Truthy, Falsy>,
): [ShallowRef<T>, (value?: T) => T]
```
