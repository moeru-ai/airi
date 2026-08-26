import type { EasingParam } from 'animejs'

export type Animator = (elements: HTMLElement[]) => (() => void)

export interface CreateAnimatorOptions {
  duration: number
  ease?: EasingParam
  loop?: boolean
}

export * from './fade'
export * from './float'
export * from './popup'
export * from './scale-popup'
export * from './stack'
