import type { Animator, CreateAnimatorOptions } from '.'

import { createTimeline } from 'animejs'

export function createFloatAnimator(options: CreateAnimatorOptions): Animator {
  return (elements: HTMLElement[]) => {
    if (elements.length === 0) {
      // NO DIV0
      return () => {}
    }

    const timeline = createTimeline({ loop: options.loop })
      .set(elements, {
        opacity: 0,
        translateX: '0.55em',
        translateY: '1.1em',
        rotateZ: 180,
        translateZ: 0,
      })
      .add(elements, {
        opacity: [0, 1],
        translateY: ['1.1em', 0],
        translateX: ['0.55em', 0],
        translateZ: 0,
        rotateZ: [180, 0],
        ...options,
        delay: (_, i) => options.duration / elements.length * i,
      })

    return () => {
      timeline.remove(elements)
    }
  }
}
