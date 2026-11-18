import type { Animator } from '.'

import { animate, cubicBezier, stagger } from 'animejs'

/**
 * The blurred stagger of AIRI text motion. The values match the slide transitions of the project talks.
 *
 * Each grapheme fades and sharpens over `durationMs`. Graphemes start `staggerMs` apart, and all starts fit in
 * `maxSpreadMs`, so a long text does not take seconds to appear.
 */
export const BLUR_FADE = {
  /** @default 500 */
  durationMs: 500,
  /** @default 40 */
  staggerMs: 40,
  /** @default 600 */
  maxSpreadMs: 600,
  /** @default 3 */
  blurPx: 3,
} as const

export type BlurFadeOptions = Partial<Record<keyof typeof BLUR_FADE, number>>

const ease = cubicBezier(0.22, 1, 0.36, 1)

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Sets the final state at once. An entered grapheme keeps no inline style, so it renders like plain text. */
function settle(elements: HTMLElement[], direction: 'in' | 'out', blurPx: number) {
  for (const element of elements) {
    element.style.opacity = direction === 'in' ? '' : '0'
    element.style.filter = direction === 'in' ? '' : `blur(${blurPx}px)`
  }
}

/**
 * Fades graphemes in or out, one after another, with a blur.
 *
 * The start state is set before this function returns, so an entering grapheme never paints unblurred first.
 * With reduced motion, the final state is set at once.
 *
 * Returns:
 * - `finished`, which resolves when the last grapheme reaches its final state.
 * - `stop`, which jumps every grapheme to its final state.
 */
export function playBlurFade(elements: HTMLElement[], direction: 'in' | 'out', options: BlurFadeOptions = {}) {
  const { durationMs, staggerMs, maxSpreadMs, blurPx } = { ...BLUR_FADE, ...options }
  if (elements.length === 0 || prefersReducedMotion()) {
    settle(elements, direction, blurPx)
    return { finished: Promise.resolve(), stop: () => {} }
  }

  const visible = { opacity: 1, filter: 'blur(0px)' }
  const hidden = { opacity: 0, filter: `blur(${blurPx}px)` }
  const [from, to] = direction === 'in' ? [hidden, visible] : [visible, hidden]
  for (const element of elements) {
    element.style.opacity = String(from.opacity)
    element.style.filter = from.filter
  }

  const animation = animate(elements, {
    opacity: [from.opacity, to.opacity],
    filter: [from.filter, to.filter],
    duration: durationMs,
    ease,
    delay: stagger(Math.min(staggerMs, maxSpreadMs / elements.length)),
  })
  const finished = new Promise<void>((resolve) => {
    animation.then(() => {
      settle(elements, direction, blurPx)
      resolve()
    })
  })

  return {
    finished,
    stop: () => {
      animation.complete()
      settle(elements, direction, blurPx)
    },
  }
}

/**
 * Creates a Poppin'Text animator that fades new graphemes in with a blurred stagger.
 *
 * @example
 * <PoppinText :text="text" :animator="createBlurFadeAnimator()" />
 */
export function createBlurFadeAnimator(options: BlurFadeOptions = {}): Animator {
  return (elements) => {
    const { stop } = playBlurFade(elements, 'in', options)
    return stop
  }
}
