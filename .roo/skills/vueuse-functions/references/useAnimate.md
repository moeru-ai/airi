---
category: Animation
---

# useAnimate

Reactive [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API).

## Usage

### Basic Usage

The `useAnimate` function returns the animation instance and control functions.

```vue
<script setup lang="ts">
import { useAnimate } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const el = useTemplateRef('el')
const {
  isSupported,
  animate,

  // actions
  play,
  pause,
  reverse,
  finish,
  cancel,

  // states
  pending,
  playState,
  replaceState,
  startTime,
  currentTime,
  timeline,
  playbackRate,
} = useAnimate(el, { transform: 'rotate(360deg)' }, 1000)
</script>

<template>
  <span ref="el" style="display:inline-block">useAnimate</span>
</template>
```

### Custom Keyframes

Either an array of keyframe objects, or a keyframe object, or a `ref`. See [Keyframe Formats](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Keyframe_Formats) for more details.

```ts
import { useAnimate } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const el = useTemplateRef('el')
// ---cut---
const keyframes = { transform: 'rotate(360deg)' }
// Or
const keyframes = [
  { transform: 'rotate(0deg)' },
  { transform: 'rotate(360deg)' },
]
// Or
const keyframes = ref([
  { clipPath: 'circle(20% at 0% 30%)' },
  { clipPath: 'circle(20% at 50% 80%)' },
  { clipPath: 'circle(20% at 100% 30%)' },
])

useAnimate(el, keyframes, 1000)
```

### Options

The third argument accepts a duration number or an options object with the following additional properties on top of [KeyframeAnimationOptions](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate#parameters):

```ts
import { useAnimate } from '@vueuse/core'

useAnimate(el, keyframes, {
  duration: 1000,
  // Start playing immediately (default: true)
  immediate: true,
  // Commit the end styling state to the element (default: false)
  commitStyles: false,
  // Persist the animation (default: false)
  persist: false,
  // Callback when animation is initialized
  onReady(animate) {
    console.log('Animation ready', animate)
  },
  // Callback when an error occurs
  onError(e) {
    console.error('Animation error', e)
  },
})
```

### Delaying Start

Set `immediate: false` to prevent the animation from starting automatically.

```ts
import { useAnimate } from '@vueuse/core'

const { play } = useAnimate(el, keyframes, {
  duration: 1000,
  immediate: false,
})

// Start the animation manually
play()
```

## Type Declarations

```ts
export interface UseAnimateOptions
  extends KeyframeAnimationOptions, ConfigurableWindow {
  /**
   * Will automatically run play when `useAnimate` is used
   *
   * @default true
   */
  immediate?: boolean
  /**
   * Whether to commits the end styling state of an animation to the element being animated
   * In general, you should use `fill` option with this.
   *
   * @default false
   */
  commitStyles?: boolean
  /**
   * Whether to persists the animation
   *
   * @default false
   */
  persist?: boolean
  /**
   * Executed after animation initialization
   */
  onReady?: (animate: Animation) => void
  /**
   * Callback when error is caught.
   */
  onError?: (e: unknown) => void
}
export type UseAnimateKeyframes = MaybeRef<
  Keyframe[] | PropertyIndexedKeyframes | null
>
export interface UseAnimateReturn extends Supportable {
  animate: ShallowRef<Animation | undefined>
  play: () => void
  pause: () => void
  reverse: () => void
  finish: () => void
  cancel: () => void
  pending: ComputedRef<boolean>
  playState: ComputedRef<AnimationPlayState>
  replaceState: ComputedRef<AnimationReplaceState>
  startTime: WritableComputedRef<CSSNumberish | number | null>
  currentTime: WritableComputedRef<CSSNumberish | null>
  timeline: WritableComputedRef<AnimationTimeline | null>
  playbackRate: WritableComputedRef<number>
}
/**
 * Reactive Web Animations API
 *
 * @see https://vueuse.org/useAnimate
 * @param target
 * @param keyframes
 * @param options
 */
export declare function useAnimate(
  target: MaybeComputedElementRef,
  keyframes: UseAnimateKeyframes,
  options?: number | UseAnimateOptions,
): UseAnimateReturn
```
