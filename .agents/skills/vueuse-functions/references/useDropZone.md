---
category: Elements
---

# useDropZone

Create a zone where files can be dropped.

::: warning

Due to Safari browser limitations, file type validation is only possible during the drop event, not during drag events. As a result, the `isOverDropZone` value will always be `true` during drag operations in Safari, regardless of file type.

:::

## Usage

```vue
<script setup lang="ts">
import { useDropZone } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const dropZoneRef = useTemplateRef('dropZoneRef')

function onDrop(files: File[] | null) {
  // called when files are dropped on zone
}

const { isOverDropZone } = useDropZone(dropZoneRef, {
  onDrop,
  // specify the types of data to be received.
  dataTypes: ['image/jpeg'],
  // control multi-file drop
  multiple: true,
  // whether to prevent default behavior for unhandled events
  preventDefaultForUnhandled: false,
})
</script>

<template>
  <div ref="dropZoneRef">
    Drop files here
  </div>
</template>
```

## Type Declarations

```ts
export interface UseDropZoneReturn {
  files: ShallowRef<File[] | null>
  isOverDropZone: ShallowRef<boolean>
}
export interface UseDropZoneOptions {
  /**
   * Allowed data types, if not set, all data types are allowed.
   * Also can be a function to check the data types.
   */
  dataTypes?:
    | MaybeRef<readonly string[]>
    | ((types: readonly string[]) => boolean)
  /**
   * Similar to dataTypes, but exposes the DataTransferItemList for custom validation.
   * If provided, this function takes precedence over dataTypes.
   */
  checkValidity?: (items: DataTransferItemList) => boolean
  onDrop?: (files: File[] | null, event: DragEvent) => void
  onEnter?: (files: File[] | null, event: DragEvent) => void
  onLeave?: (files: File[] | null, event: DragEvent) => void
  onOver?: (files: File[] | null, event: DragEvent) => void
  /**
   * Allow multiple files to be dropped. Defaults to true.
   */
  multiple?: boolean
  /**
   * Prevent default behavior for unhandled events. Defaults to false.
   */
  preventDefaultForUnhandled?: boolean
}
export declare function useDropZone(
  target: MaybeRefOrGetter<HTMLElement | Document | null | undefined>,
  options?: UseDropZoneOptions | UseDropZoneOptions["onDrop"],
): UseDropZoneReturn
```
