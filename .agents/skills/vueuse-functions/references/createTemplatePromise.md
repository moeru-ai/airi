---
category: Component
outline: deep
---

# createTemplatePromise

Template as Promise. Useful for constructing custom Dialogs, Modals, Toasts, etc.

## Usage

```vue
<script setup lang="ts">
import { createTemplatePromise } from '@vueuse/core'

const TemplatePromise = createTemplatePromise<ReturnType>()

async function open() {
  const result = await TemplatePromise.start()
  // button is clicked, result is 'ok'
}
</script>

<template>
  <TemplatePromise v-slot="{ promise, resolve, reject, args }">
    <!-- your UI -->
    <button @click="resolve('ok')">
      OK
    </button>
  </TemplatePromise>
</template>
```

## Features

- **Programmatic** - call your UI as a promise
- **Template** - use Vue template to render, not a new DSL
- **TypeScript** - full type safety via generic type
- **Renderless** - you take full control of the UI
- **Transition** - use support Vue transition

This function is migrated from [vue-template-promise](https://github.com/antfu/vue-template-promise)

## Usage

`createTemplatePromise` returns a **Vue Component** that you can directly use in your template with `<script setup>`

```ts twoslash include main
import { createTemplatePromise } from '@vueuse/core'

const TemplatePromise = createTemplatePromise()
const MyPromise = createTemplatePromise<boolean>() // with generic type
```

In template, use `v-slot` to access the promise and resolve functions.

```vue
<template>
  <TemplatePromise v-slot="{ promise, resolve, reject, args }">
    <!-- you can have anything -->
    <button @click="resolve('ok')">
      OK
    </button>
  </TemplatePromise>
  <MyPromise v-slot="{ promise, resolve, reject, args }">
    <!-- another one -->
  </MyPromise>
</template>
```

The slot will not be rendered initially (similar to `v-if="false"`), until you call the `start` method from the component.

```ts
// @include: main
// ---cut---
const result = await TemplatePromise.start()
```

Once `resolve` or `reject` is called in the template, the promise will be resolved or rejected, returning the value you passed in. Once resolved, the slot will be removed automatically.

### Passing Arguments

You can pass arguments to the `start` with arguments.

```ts twoslash include passing-arguments
import { createTemplatePromise } from '@vueuse/core'

const TemplatePromise = createTemplatePromise<boolean, [string, number]>()
```

```ts
// @include: passing-arguments
// ---cut---
const result = await TemplatePromise.start('hello', 123) // Pr
```

And in the template slot, you can access the arguments via `args` property.

```vue
<template>
  <TemplatePromise v-slot="{ args, resolve }">
    <div>{{ args[0] }}</div>
    <!-- hello -->
    <div>{{ args[1] }}</div>
    <!-- 123 -->
    <button @click="resolve(true)">
      OK
    </button>
  </TemplatePromise>
</template>
```

### Singleton Mode

Use the `singleton` option to ensure only one instance of the promise can be active at a time. If `start` is called while a promise is already active, it will return the existing promise instead of creating a new one.

```ts
import { createTemplatePromise } from '@vueuse/core'

const TemplatePromise = createTemplatePromise<boolean>({
  singleton: true,
})

// These will return the same promise if called in quick succession
const result1 = TemplatePromise.start()
const result2 = TemplatePromise.start() // returns the same promise as result1
```

### Transition

You can use transition to animate the slot.

```vue
<script setup lang="ts">
const TemplatePromise = createTemplatePromise<ReturnType>({
  transition: {
    name: 'fade',
    appear: true,
  },
})
</script>

<template>
  <TemplatePromise v-slot="{ resolve }">
    <!-- your UI -->
    <button @click="resolve('ok')">
      OK
    </button>
  </TemplatePromise>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>
```

Learn more about [Vue Transition](https://vuejs.org/guide/built-ins/transition.html).

### Slot Props

The slot provides the following props:

| Prop          | Type                                     | Description                                               |
| ------------- | ---------------------------------------- | --------------------------------------------------------- |
| `promise`     | `Promise<Return> \| undefined`           | The current promise instance                              |
| `resolve`     | `(v: Return \| Promise<Return>) => void` | Resolve the promise with a value                          |
| `reject`      | `(v: any) => void`                       | Reject the promise                                        |
| `args`        | `Args`                                   | Arguments passed to `start()`                             |
| `isResolving` | `boolean`                                | `true` when resolving another promise passed to `resolve` |
| `key`         | `number`                                 | Unique key for list rendering                             |

```vue
<template>
  <TemplatePromise v-slot="{ promise, resolve, reject, args, isResolving }">
    <div v-if="isResolving">
      Loading...
    </div>
    <div v-else>
      <button @click="resolve('ok')">
        OK
      </button>
      <button @click="reject('cancelled')">
        Cancel
      </button>
    </div>
  </TemplatePromise>
</template>
```

## Motivation

The common approach to call a dialog or a modal programmatically would be like this:

```ts
const dialog = useDialog()
const result = await dialog.open({
  title: 'Hello',
  content: 'World',
})
```

This would work by sending these information to the top-level component and let it render the dialog. However, it limits the flexibility you could express in the UI. For example, you could want the title to be red, or have extra buttons, etc. You would end up with a lot of options like:

```ts
const result = await dialog.open({
  title: 'Hello',
  titleClass: 'text-red',
  content: 'World',
  contentClass: 'text-blue text-sm',
  buttons: [
    { text: 'OK', class: 'bg-red', onClick: () => {} },
    { text: 'Cancel', class: 'bg-blue', onClick: () => {} },
  ],
  // ...
})
```

Even this is not flexible enough. If you want more, you might end up with manual render function.

```ts
const result = await dialog.open({
  title: 'Hello',
  contentSlot: () => h(MyComponent, { content }),
})
```

This is like reinventing a new DSL in the script to express the UI template.

So this function allows **expressing the UI in templates instead of scripts**, where it is supposed to be, while still being able to be manipulated programmatically.

## Type Declarations

```ts
export interface TemplatePromiseProps<Return, Args extends any[] = []> {
  /**
   * The promise instance.
   */
  promise: Promise<Return> | undefined
  /**
   * Resolve the promise.
   */
  resolve: (v: Return | Promise<Return>) => void
  /**
   * Reject the promise.
   */
  reject: (v: any) => void
  /**
   * Arguments passed to TemplatePromise.start()
   */
  args: Args
  /**
   * Indicates if the promise is resolving.
   * When passing another promise to `resolve`, this will be set to `true` until the promise is resolved.
   */
  isResolving: boolean
  /**
   * Options passed to createTemplatePromise()
   */
  options: TemplatePromiseOptions
  /**
   * Unique key for list rendering.
   */
  key: number
}
export interface TemplatePromiseOptions {
  /**
   * Determines if the promise can be called only once at a time.
   *
   * @default false
   */
  singleton?: boolean
  /**
   * Transition props for the promise.
   */
  transition?: TransitionGroupProps
}
export type TemplatePromise<
  Return,
  Args extends any[] = [],
> = DefineComponent<object> & {
  new (): {
    $slots: {
      default: (_: TemplatePromiseProps<Return, Args>) => any
    }
  }
} & {
  start: (...args: Args) => Promise<Return>
}
/**
 * Creates a template promise component.
 *
 * @see https://vueuse.org/createTemplatePromise
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function createTemplatePromise<Return, Args extends any[] = []>(
  options?: TemplatePromiseOptions,
): TemplatePromise<Return, Args>
```
