---
category: Component
related: useVModel
---

# useVModels

Shorthand for props v-model binding. Think it like `toRefs(props)` but changes will also trigger emit.

## Usage

```ts
import { useVModels } from '@vueuse/core'

const props = defineProps({
  foo: string,
  bar: number,
})

const emit = defineEmits(['update:foo', 'update:bar'])

const { foo, bar } = useVModels(props, emit)
```

### Options API

```ts
import { useVModels } from '@vueuse/core'

export default {
  props: {
    foo: String,
    bar: Number,
  },
  setup(props, { emit }) {
    const { foo, bar } = useVModels(props, emit)

    console.log(foo.value) // props.foo
    foo.value = 'foo' // emit('update:foo', 'foo')
  },
}
```

## Type Declarations

```ts
/**
 * Shorthand for props v-model binding. Think like `toRefs(props)` but changes will also emit out.
 *
 * @see https://vueuse.org/useVModels
 * @param props
 * @param emit
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useVModels<P extends object, Name extends string>(
  props: P,
  emit?: (name: Name, ...args: any[]) => void,
  options?: UseVModelOptions<any, true>,
): ToRefs<P>
export declare function useVModels<P extends object, Name extends string>(
  props: P,
  emit?: (name: Name, ...args: any[]) => void,
  options?: UseVModelOptions<any, false>,
): ToRefs<P>
```
