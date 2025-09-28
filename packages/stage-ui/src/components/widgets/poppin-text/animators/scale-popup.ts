import type { Animator, CreateAnimatorOptions } from '.'

import { createSpring, createTimeline } from 'animejs'

export function createCutePopupAnimator(options: CreateAnimatorOptions): Animator {
  return (elements: HTMLElement[]) => {
    if (elements.length === 0) {
      // NO DIV0
      return () => {}
    }

    const timeline = createTimeline({ loop: options.loop })
      .set(elements, {
        opacity: 0,
        scale: 0,
        translateY: '1.1em',
        translateZ: 0,
      })
      .add(elements, {
        opacity: [0, 1],
        scale: [0, 1],
        translateY: ['1.1em', 0],
        translateZ: 0,
        ...options,
        delay: (_, i) => options.duration / elements.length * i,
        ease: createSpring(),
      })

    return () => {
      timeline.remove(elements)
    }
  }
}
