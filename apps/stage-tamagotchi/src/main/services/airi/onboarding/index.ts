import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import type { OnboardingWindowManager } from '../../../windows/onboarding'

import { defineInvokeHandler } from '@moeru/eventa'
import { animate, utils } from 'animejs'
import { screen } from 'electron'

import { electronOpenOnboarding } from '../../../../shared/eventa'
import { computeAdjacentPosition } from '../../../windows/shared/display'

const ANIMATION_DURATION = 350

function animateWindowPosition(
  window: BrowserWindow,
  targetX: number,
  targetY: number,
): ReturnType<typeof animate> | undefined {
  if (window.isDestroyed())
    return undefined

  const bounds = window.getBounds()
  const state = { x: bounds.x, y: bounds.y }

  return animate(state, {
    x: targetX,
    y: targetY,
    duration: ANIMATION_DURATION,
    ease: 'outCubic',
    modifier: utils.round(0),
    onRender: () => {
      if (!window.isDestroyed())
        window.setPosition(Math.round(state.x), Math.round(state.y))
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

    const newPosition = computeAdjacentPosition(
      onboardingBounds,
      { width: savedBounds.width, height: savedBounds.height },
      display.workArea,
    )

    currentAnimation?.pause()
    currentAnimation = animateWindowPosition(params.mainWindow, newPosition.x, newPosition.y)

    let userMovedManually = false
    let ignoreNextMoves = true

    const moveListener = () => {
      if (ignoreNextMoves)
        return
      userMovedManually = true
    }

    params.mainWindow.on('move', moveListener)
    setTimeout(() => {
      ignoreNextMoves = false
    }, ANIMATION_DURATION + 50)

    cleanupOnClosed?.()

    cleanupOnClosed = params.onboardingWindowManager.onClosed(() => {
      params.mainWindow.removeListener('move', moveListener)

      if (!userMovedManually && !params.mainWindow.isDestroyed()) {
        currentAnimation?.pause()
        currentAnimation = animateWindowPosition(params.mainWindow, savedBounds.x, savedBounds.y)
      }

      cleanupOnClosed = undefined
    })
  })
}
