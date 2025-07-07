import type { Animator } from '.'

import { createTimeline } from 'animejs'

export const fadeAnimator: Animator = (elements: HTMLElement[]) => {
  const timeline = createTimeline({ loop: true })
    .set(elements, {
      opacity: 0,
    })
    .add(elements, {
      opacity: [0, 1],
      easing: 'easeInOutQuad',
      duration: 2250,
      delay: (_, i) => 150 * (i + 1),
    })

  return () => {
    timeline.remove(elements)
  }
}
