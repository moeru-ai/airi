import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow, Rectangle } from 'electron'

import type { OnboardingWindowManager } from '../../../windows/onboarding'

import { defineInvokeHandler } from '@moeru/eventa'
import { animate, utils } from 'animejs'
import { screen } from 'electron'

import { electronOpenOnboarding } from '../../../../shared/eventa'
import { computeAdjacentPosition } from '../../../windows/shared/display'

const ANIMATION_DURATION = 350

function animateWindowBounds(
  window: BrowserWindow,
  target: Rectangle,
): ReturnType<typeof animate> | undefined {
  if (window.isDestroyed())
    return undefined

  const current = window.getBounds()
  const state = { x: current.x, y: current.y, w: current.width, h: current.height }

  return animate(state, {
    x: target.x,
    y: target.y,
    w: target.width,
    h: target.height,
    duration: ANIMATION_DURATION,
    ease: 'outCubic',
    modifier: utils.round(0),
    onRender: () => {
      if (!window.isDestroyed()) {
        window.setBounds({
          x: Math.round(state.x),
          y: Math.round(state.y),
          width: Math.round(state.w),
          height: Math.round(state.h),
        })
      }
    },
  })
}

export function createOnboardingService(params: {
  context: ReturnType<typeof createContext>['context']
  onboardingWindowManager: OnboardingWindowManager
  mainWindow: BrowserWindow
}) {
  let currentAnimation: ReturnType<typeof animate> | undefined
  let cleanupOnClosed: (() => void) | undefined

  defineInvokeHandler(params.context, electronOpenOnboarding, async () => {
    const savedBounds = params.mainWindow.getBounds()

    const onboardingWindow = await params.onboardingWindowManager.getAndToggleWindow()
    const onboardingBounds = onboardingWindow.getBounds()
    const display = screen.getDisplayMatching(onboardingBounds)

    const adjacent = computeAdjacentPosition(
      onboardingBounds,
      { width: savedBounds.width, height: savedBounds.height },
      display.workArea,
    )

    currentAnimation?.pause()
    currentAnimation = animateWindowBounds(params.mainWindow, {
      x: adjacent.x,
      y: adjacent.y,
      width: adjacent.width,
      height: adjacent.height,
    })

    let userMovedManually = false
    let ignoreNextMoves = true

    const moveListener = () => {
      if (ignoreNextMoves)
        return
      userMovedManually = true
    }

    params.mainWindow.on('move', moveListener)
    params.mainWindow.on('resize', moveListener)
    setTimeout(() => {
      ignoreNextMoves = false
    }, ANIMATION_DURATION + 50)

    cleanupOnClosed?.()

    cleanupOnClosed = params.onboardingWindowManager.onClosed(() => {
      params.mainWindow.removeListener('move', moveListener)
      params.mainWindow.removeListener('resize', moveListener)

      if (!userMovedManually && !params.mainWindow.isDestroyed()) {
        currentAnimation?.pause()
        currentAnimation = animateWindowBounds(params.mainWindow, savedBounds)
      }

      cleanupOnClosed = undefined
    })
  })
}
