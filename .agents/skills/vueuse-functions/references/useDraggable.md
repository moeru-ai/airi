---
category: Elements
---

# useDraggable

Make elements draggable.

## Usage

```vue
<script setup lang="ts">
import { useDraggable } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const el = useTemplateRef('el')

// `style` will be a helper computed for `left: ?px; top: ?px;`
const { x, y, style } = useDraggable(el, {
  initialValue: { x: 40, y: 40 },
})
</script>

<template>
  <div ref="el" :style="style" style="position: fixed">
    Drag me! I am at {{ x }}, {{ y }}
  </div>
</template>
```

### Return Values

| Property     | Type                   | Description                             |
| ------------ | ---------------------- | --------------------------------------- |
| `x`          | `Ref<number>`          | Current x position                      |
| `y`          | `Ref<number>`          | Current y position                      |
| `position`   | `Ref<{x, y}>`          | Current position object                 |
| `isDragging` | `ComputedRef<boolean>` | Whether currently dragging              |
| `style`      | `ComputedRef<string>`  | CSS style string `left: ?px; top: ?px;` |

### Options

```ts
useDraggable(el, {
  // Initial position (default: { x: 0, y: 0 })
  initialValue: { x: 40, y: 40 },
  // Restrict dragging to specific axis: 'x', 'y', or 'both' (default)
  axis: 'both',
  // Only trigger when clicking directly on the element (default: false)
  exact: false,
  // Prevent default browser behavior (default: false)
  preventDefault: true,
  // Stop event propagation (default: false)
  stopPropagation: false,
  // Use capture phase for events (default: true)
  capture: true,
  // Disable dragging (default: false)
  disabled: false,
  // Mouse buttons that trigger drag (default: [0] - left button)
  buttons: [0],
  // Pointer types to listen to (default: ['mouse', 'touch', 'pen'])
  pointerTypes: ['mouse', 'touch', 'pen'],
  // Custom drag handle element (default: target element)
  handle: handleRef,
  // Container element for bounds (default: none)
  containerElement: containerRef,
  // Element to attach pointermove/pointerup events (default: window)
  draggingElement: window,
  // Callbacks
  onStart: (position, event) => {
    // Return false to prevent dragging
  },
  onMove: (position, event) => {},
  onEnd: (position, event) => {},
})
```

### Prevent Default

Set `preventDefault: true` to override the default drag-and-drop behavior of certain elements in the browser (e.g., images).

```ts
import { useDraggable } from '@vueuse/core'

const { x, y, style } = useDraggable(el, {
  preventDefault: true,
})
```

### Container Bounds

Use `containerElement` to constrain dragging within a container.

```ts
import { useDraggable } from '@vueuse/core'

const { x, y } = useDraggable(el, {
  containerElement: containerRef,
})
```

Set `autoScroll: true` to enable auto-scroll when dragging near the edges.

```ts
const { x, y, style } = useDraggable(el, {
  autoScroll: {
    speed: 2, // Control the speed of auto-scroll.
    margin: 30, // Set the margin from the edge that triggers auto-scroll.
    direction: 'both' // Determine the direction of auto-scroll.
  },
})
```

## Component Usage

```vue
<template>
  <UseDraggable v-slot="{ x, y }" :initial-value="{ x: 10, y: 10 }">
    Drag me! I am at {{ x }}, {{ y }}
  </UseDraggable>
</template>
```

For component usage, additional props `storageKey` and `storageType` can be passed to the component and enable the persistence of the element position.

```vue
<template>
  <UseDraggable storage-key="vueuse-draggable" storage-type="session">
    Refresh the page and I am still in the same position!
  </UseDraggable>
</template>
```

## Type Declarations

```ts
export interface UseDraggableOptions {
  /**
   * Only start the dragging when click on the element directly
   *
   * @default false
   */
  exact?: MaybeRefOrGetter<boolean>
  /**
   * Prevent events defaults
   *
   * @default false
   */
  preventDefault?: MaybeRefOrGetter<boolean>
  /**
   * Prevent events propagation
   *
   * @default false
   */
  stopPropagation?: MaybeRefOrGetter<boolean>
  /**
   * Whether dispatch events in capturing phase
   *
   * @default true
   */
  capture?: boolean
  /**
   * Element to attach `pointermove` and `pointerup` events to.
   *
   * @default window
   */
  draggingElement?: MaybeRefOrGetter<
    HTMLElement | SVGElement | Window | Document | null | undefined
  >
  /**
   * Element for calculating bounds (If not set, it will use the event's target).
   *
   * @default undefined
   */
  containerElement?: MaybeRefOrGetter<
    HTMLElement | SVGElement | null | undefined
  >
  /**
   * Handle that triggers the drag event
   *
   * @default target
   */
  handle?: MaybeRefOrGetter<HTMLElement | SVGElement | null | undefined>
  /**
   * Pointer types that listen to.
   *
   * @default ['mouse', 'touch', 'pen']
   */
  pointerTypes?: PointerType[]
  /**
   * Initial position of the element.
   *
   * @default { x: 0, y: 0 }
   */
  initialValue?: MaybeRefOrGetter<Position>
  /**
   * Callback when the dragging starts. Return `false` to prevent dragging.
   */
  onStart?: (position: Position, event: PointerEvent) => void | false
  /**
   * Callback during dragging.
   */
  onMove?: (position: Position, event: PointerEvent) => void
  /**
   * Callback when dragging end.
   */
  onEnd?: (position: Position, event: PointerEvent) => void
  /**
   * Axis to drag on.
   *
   * @default 'both'
   */
  axis?: "x" | "y" | "both"
  /**
   * Disabled drag and drop.
   *
   * @default false
   */
  disabled?: MaybeRefOrGetter<boolean>
  /**
   * Mouse buttons that are allowed to trigger drag events.
   *
   * - `0`: Main button, usually the left button or the un-initialized state
   * - `1`: Auxiliary button, usually the wheel button or the middle button (if present)
   * - `2`: Secondary button, usually the right button
   * - `3`: Fourth button, typically the Browser Back button
   * - `4`: Fifth button, typically the Browser Forward button
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button#value
   * @default [0]
   */
  buttons?: MaybeRefOrGetter<number[]>
  /**
   * Whether to restrict dragging within the visible area of the container.
   *
   * If enabled, the draggable element will not leave the visible area of its container,
   * ensuring it remains within the viewport of the container during the drag.
   *
   * @default false
   */
  restrictInView?: MaybeRefOrGetter<boolean>
  /**
   * Whether to enable auto-scroll when dragging near the edges.
   *
   * @default false
   */
  autoScroll?: MaybeRefOrGetter<
    | boolean
    | {
        /**
         * Speed of auto-scroll.
         *
         * @default 2
         */
        speed?: MaybeRefOrGetter<number | Position>
        /**
         * Margin from the edge to trigger auto-scroll.
         *
         * @default 30
         */
        margin?: MaybeRefOrGetter<number | Position>
        /**
         * Direction of auto-scroll.
         *
         * @default 'both'
         */
        direction?: "x" | "y" | "both"
      }
  >
}
export interface UseDraggableReturn {
  x: Ref<number>
  y: Ref<number>
  position: Ref<Position>
  isDragging: ComputedRef<boolean>
  style: ComputedRef<string>
}
/**
 * Make elements draggable.
 *
 * @see https://vueuse.org/useDraggable
 * @param target
 * @param options
 */
export declare function useDraggable(
  target: MaybeRefOrGetter<HTMLElement | SVGElement | null | undefined>,
  options?: UseDraggableOptions,
): UseDraggableReturn
```
