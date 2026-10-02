import type { Animator, CreateAnimatorOptions } from '.'

import { createTimeline } from 'animejs'

export function createStackAnimator(options: CreateAnimatorOptions): Animator {
  return (elements: HTMLElement[]) => {
    if (elements.length === 0) {
      // NO DIV0
      return () => {}
    }

    const timeline = createTimeline({ loop: options.loop })
      .set(elements, {
        opacity: 0,
        translateX: 40,
        translateZ: 0,
      })
      .add(elements, {
        opacity: [0, 1],
        translateX: [40, 0],
        translateZ: 0,
        ...options,
        delay: (_: unknown, i = 0) => options.duration / elements.length * (i + 1),
      })

    return () => {
      timeline.remove(elements)
    }
  }
}
