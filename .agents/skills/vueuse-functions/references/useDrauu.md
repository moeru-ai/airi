---
category: '@Integrations'
---

# useDrauu

Reactive instance for [drauu](https://github.com/antfu/drauu).

## Install

```bash
npm i drauu@^0
```

## Usage

```vue
<script setup lang="ts">
import { toRefs } from '@vueuse/core'
import { useDrauu } from '@vueuse/integrations/useDrauu'
import { useTemplateRef } from 'vue'

const target = useTemplateRef('target')
const { undo, redo, canUndo, canRedo, brush } = useDrauu(target)
const { color, size } = toRefs(brush)
</script>

<template>
  <svg ref="target" />
</template>
```

## Type Declarations

```ts
export type UseDrauuOptions = Omit<Options, "el">
export interface UseDrauuReturn {
  drauuInstance: Ref<Drauu | undefined>
  load: (svg: string) => void
  dump: () => string | undefined
  clear: () => void
  cancel: () => void
  undo: () => boolean | undefined
  redo: () => boolean | undefined
  canUndo: ShallowRef<boolean>
  canRedo: ShallowRef<boolean>
  brush: Ref<Brush>
  onChanged: EventHookOn
  onCommitted: EventHookOn
  onStart: EventHookOn
  onEnd: EventHookOn
  onCanceled: EventHookOn
}
/**
 * Reactive drauu
 *
 * @see https://vueuse.org/useDrauu
 * @param target The target svg element
 * @param options Drauu Options
 */
export declare function useDrauu(
  target: MaybeComputedElementRef,
  options?: UseDrauuOptions,
): UseDrauuReturn
```
