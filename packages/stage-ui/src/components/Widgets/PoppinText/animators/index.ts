import type { EasingParam } from 'animejs'

export interface CreateAnimatorOptions {
  duration: number
  ease?: EasingParam
}

export type Animator = (elements: HTMLElement[]) => (() => void)

export * from './fade'
export * from './float'
export * from './popup'
