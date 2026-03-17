---
category: '@Integrations'
---

# useFocusTrap

Reactive wrapper for [`focus-trap`](https://github.com/focus-trap/focus-trap).

For more information on what options can be passed, see [`createOptions`](https://github.com/focus-trap/focus-trap#createoptions) in the `focus-trap` documentation.

## Install

```bash
npm i focus-trap@^7
```

## Usage

**Basic Usage**

```vue
<script setup lang="ts">
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
import { useTemplateRef } from 'vue'

const target = useTemplateRef('target')
const { hasFocus, activate, deactivate } = useFocusTrap(target)
</script>

<template>
  <div>
    <button @click="activate()">
      Activate
    </button>
    <div ref="target">
      <span>Has Focus: {{ hasFocus }}</span>
      <input type="text">
      <button @click="deactivate()">
        Deactivate
      </button>
    </div>
  </div>
</template>
```

**Multiple Refs**

```vue
<script setup lang="ts">
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
import { useTemplateRef } from 'vue'

const targetOne = useTemplateRef('targetOne')
const targetTwo = useTemplateRef('targetTwo')
const { hasFocus, activate, deactivate } = useFocusTrap([targetOne, targetTwo])
</script>

<template>
  <div>
    <button @click="activate()">
      Activate
    </button>
    <div ref="targetOne">
      <span>Has Focus: {{ hasFocus }}</span>
      <input type="text">
    </div>
    ...
    <div ref="targetTow">
      <p>Another target here</p>
      <input type="text">
      <button @click="deactivate()">
        Deactivate
      </button>
    </div>
  </div>
</template>
```

**Dynamic Focus Target**

```vue
<script setup lang="ts">
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
import { computed, shallowRef, useTemplateRef } from 'vue'

const left = useTemplateRef('left')
const right = useTemplateRef('right')
const currentRef = shallowRef<'left' | 'right'>('left')

const target = computed(() =>
  currentRef.value === 'left'
    ? left
    : currentRef.value === 'right'
      ? right
      : null,
)

const { activate } = useFocusTrap(target)
</script>

<template>
  <div>
    <div ref="left" class="left">
      ...
    </div>
    <div ref="right" class="right">
      ...
    </div>
  </div>
</template>
```

**Automatically Focus**

```vue
<script setup lang="ts">
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
import { useTemplateRef } from 'vue'

const target = useTemplateRef('target')
const { hasFocus, activate, deactivate } = useFocusTrap(target, { immediate: true })
</script>

<template>
  <div>
    <div ref="target">
      ...
    </div>
  </div>
</template>
```

**Conditional Rendering**

This function can't properly activate focus on elements with conditional rendering using `v-if`. This is because they do not exist in the DOM at the time of the focus activation. To solve this you need to activate on the next tick.

```vue
<script setup lang="ts">
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
import { nextTick, useTemplateRef } from 'vue'

const target = useTemplateRef('target')
const { activate, deactivate } = useFocusTrap(target, { immediate: true })

const show = ref(false)

async function reveal() {
  show.value = true

  await nextTick()
  activate()
}
</script>

<template>
  <div>
    <div v-if="show" ref="target">
      ...
    </div>

    <button @click="reveal">
      Reveal and Focus
    </button>
  </div>
</template>
```

## Using Component

With the `UseFocusTrap` component, Focus Trap will be activated automatically on mounting this component and deactivated on unmount.

```vue
<script setup lang="ts">
import { UseFocusTrap } from '@vueuse/integrations/useFocusTrap/component'
import { shallowRef } from 'vue'

const show = shallowRef(false)
</script>

<template>
  <UseFocusTrap v-if="show" :options="{ immediate: true }">
    <div class="modal">
      ...
    </div>
  </UseFocusTrap>
</template>
```

## Type Declarations

```ts
export interface UseFocusTrapOptions extends Options {
  /**
   * Immediately activate the trap
   */
  immediate?: boolean
}
export interface UseFocusTrapReturn {
  /**
   * Indicates if the focus trap is currently active
   */
  hasFocus: ShallowRef<boolean>
  /**
   * Indicates if the focus trap is currently paused
   */
  isPaused: ShallowRef<boolean>
  /**
   * Activate the focus trap
   *
   * @see https://github.com/focus-trap/focus-trap#trapactivateactivateoptions
   * @param opts Activate focus trap options
   */
  activate: (opts?: ActivateOptions) => void
  /**
   * Deactivate the focus trap
   *
   * @see https://github.com/focus-trap/focus-trap#trapdeactivatedeactivateoptions
   * @param opts Deactivate focus trap options
   */
  deactivate: (opts?: DeactivateOptions) => void
  /**
   * Pause the focus trap
   *
   * @see https://github.com/focus-trap/focus-trap#trappause
   */
  pause: Fn
  /**
   * Unpauses the focus trap
   *
   * @see https://github.com/focus-trap/focus-trap#trapunpause
   */
  unpause: Fn
}
/**
 * Reactive focus-trap
 *
 * @see https://vueuse.org/useFocusTrap
 */
export declare function useFocusTrap(
  target: MaybeRefOrGetter<
    Arrayable<MaybeRefOrGetter<string> | MaybeComputedElementRef>
  >,
  options?: UseFocusTrapOptions,
): UseFocusTrapReturn
```
