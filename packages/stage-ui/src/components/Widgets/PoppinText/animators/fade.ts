import type { Animator, CreateAnimatorOptions } from '.'

import { createTimeline } from 'animejs'

export function createFadeAnimator(options: CreateAnimatorOptions): Animator {
  return (elements: HTMLElement[]) => {
    if (elements.length === 0) {
      // NO DIV0
      return () => {}
    }

    const timeline = createTimeline({ loop: options.loop })
      .set(elements, {
        opacity: 0,
      })
      .add(elements, {
        opacity: [0, 1],
        ...options,
        delay: (_, i) => options.duration / elements.length * (i + 1),
      })

    return () => {
      timeline.remove(elements)
    }
  }
}
