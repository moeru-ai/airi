<script lang="ts">
/**
 * Samples a spring into a CSS `linear()` easing. The spring has the model of SwiftUI and anime.js: a perceived duration
 * and a bounce from 0 (no overshoot) to 1. The easing runs until the spring rests, so its duration is longer than the
 * perceived one.
 *
 * @example
 * springEasing(0.45, 520)
 * // => { easing: 'linear(0.0000, …, 1.0000)', duration: 1300 }
 */
</script>

<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'

/**
 * Buds an element off a neighbor, such as an island off its dock, and merges it back under the neighbor when it leaves.
 *
 * The slot holds one element with `v-if`, in the same row or column as the neighbor. The element starts small under
 * the edge of the neighbor and springs out to its place. When it leaves, it slides back under the neighbor and shrinks.
 * The neighbor must sit above the element, for example with a higher `z-index`, so the element hides under it.
 */
const props = withDefaults(defineProps<{
  /** The side of the element where its neighbor is. The element buds from there. */
  from: 'left' | 'right' | 'top' | 'bottom'
  /** The space between the neighbor and the element, in pixels. It matches the gap of their row. @default 8 */
  gap?: number
  /** The wait before the element buds, in milliseconds, for example until the neighbor has opened. @default 0 */
  delay?: number
}>(), {
  gap: 8,
  delay: 0,
})

function springEasing(bounce: number, perceivedMs: number) {
  const zeta = 1 - bounce
  const omega = (2 * Math.PI) / (perceivedMs / 1000)
  const damped = omega * Math.sqrt(1 - zeta * zeta)
  const position = (seconds: number) => 1 - Math.exp(-zeta * omega * seconds)
    * (Math.cos(damped * seconds) + (zeta * omega / damped) * Math.sin(damped * seconds))

  // The spring rests once it stays within 0.0005 of its place for 200ms, in steps of 20ms. The curve keeps that rest at
  // its end, as anime.js does, so both run for the same time.
  let seconds = 0
  let restSteps = 0
  for (let time = 0; restSteps <= 10; time += 0.02) {
    restSteps = Math.abs(1 - position(time)) < 0.0005 ? restSteps + 1 : 0
    seconds = time
  }
  const samples = Array.from({ length: 61 }, (_, index) => index === 60 ? 1 : position(seconds * index / 60))
  return { easing: `linear(${samples.map(sample => sample.toFixed(4)).join(', ')})`, duration: Math.round(seconds * 1000) }
}

/** The spring carries the element a little past its place and lets it settle, like a bubble. */
const BUD_SPRING = springEasing(0.45, 520)

const reducedMotion = usePreferredReducedMotion()
const running = new WeakMap<Element, Animation>()

/** The transform that puts the element under its neighbor: past the gap and its own size, toward the neighbor. */
function underNeighbor(element: HTMLElement) {
  switch (props.from) {
    case 'left':
      return `translateX(${-(props.gap + element.offsetWidth)}px) scale(0.4)`
    case 'right':
      return `translateX(${props.gap + element.offsetWidth}px) scale(0.4)`
    case 'top':
      return `translateY(${-(props.gap + element.offsetHeight)}px) scale(0.4)`
    case 'bottom':
      return `translateY(${props.gap + element.offsetHeight}px) scale(0.4)`
  }
}

/** Runs one animation on the element, after it stops the one that runs. */
function play(element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions, done: () => void) {
  running.get(element)?.cancel()
  if (reducedMotion.value === 'reduce')
    return done()
  const animation = element.animate(keyframes, options)
  running.set(element, animation)
  animation.onfinish = () => {
    running.delete(element)
    done()
  }
}

function bud(element: Element, done: () => void) {
  // A browser without `linear()` easing gets a plain ease-out of the same length.
  const easing = typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)') ? BUD_SPRING.easing : 'ease-out'
  // `backwards` keeps the element clear and under its neighbor while it waits.
  play(element, [
    { transform: underNeighbor(element as HTMLElement), opacity: 0 },
    { transform: 'none', opacity: 1 },
  ], { duration: BUD_SPRING.duration, delay: props.delay, easing, fill: 'backwards' }, done)
}

function merge(element: Element, done: () => void) {
  // A merge that starts during a bud starts where the bud is.
  const { transform, opacity } = getComputedStyle(element)
  // An ease-in quad: the element speeds up as it goes under its neighbor.
  play(element, [
    { transform, opacity },
    { transform: underNeighbor(element as HTMLElement), opacity },
  ], { duration: 220, easing: 'cubic-bezier(0.11, 0, 0.5, 0)', fill: 'forwards' }, done)
}
</script>

<template>
  <Transition :css="false" @enter="bud" @leave="merge">
    <slot />
  </Transition>
</template>
