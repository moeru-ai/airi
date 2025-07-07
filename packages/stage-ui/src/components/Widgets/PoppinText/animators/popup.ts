import type { Animator } from '.'

import { createTimeline } from 'animejs'

export const popupAnimator: Animator = (elements: HTMLElement[]) => {
  const timeline = createTimeline({ loop: true })
    .add(elements, {
      translateY: ['1.1em', 0],
      translateZ: 0,
      duration: 750,
      delay: (el, i) => 50 * i,
    })

  return () => {
    timeline.remove(elements)
  }
}
