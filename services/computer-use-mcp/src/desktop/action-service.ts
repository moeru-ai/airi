import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ExecuteAction } from '../server/action-executor'
import type {
  DesktopActionPlan,
  DesktopActionPlanResult,
  DesktopScene,
} from './types'

export type MoveResizeWindowResult
  = | {
    status: 'completed'
    reason: string
    windowId: string
  }
  | {
    status: 'failed'
    reason: string
    detail?: CallToolResult
  }
  | {
    status: 'unsupported'
    reason: string
    notice: string
  }

function actionFailed(result: CallToolResult) {
  return result.isError === true
}

function errorText(result: CallToolResult) {
  const text = result.content
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join(' ')

  const structured = result.structuredContent
  const structuredReason = structured && typeof structured === 'object' && 'reason' in structured
    ? String((structured as Record<string, unknown>).reason ?? '')
    : ''

  return `${text} ${structuredReason}`.toLowerCase()
}

export class DesktopActionService {
  constructor(private readonly executeAction: ExecuteAction) {}

  async focusWindow(scene: DesktopScene, windowId: string) {
    const target = scene.windows.find(window => window.id === windowId)
    if (!target) {
      return {
        status: 'failed' as const,
        reason: `window_not_found:${windowId}`,
      }
    }

    const focusResult = await this.executeAction({
      kind: 'focus_window',
      input: {
        windowId: target.id,
        windowNumber: target.windowNumber,
        ownerPid: target.ownerPid,
        appName: target.appName,
        title: target.title,
        bounds: target.bounds,
        observedBounds: target.bounds,
      },
    }, 'desktop_focus_window', {
      skipApprovalQueue: true,
    })

    const focusErrorText = errorText(focusResult)

    if (actionFailed(focusResult)) {
      return {
        status: 'failed' as const,
        reason: focusErrorText.includes('unsupported')
          ? `focus_window_unsupported:${target.id}`
          : `focus_window_failed:${target.id}`,
        detail: focusResult,
      }
    }

    return {
      status: 'completed' as const,
      reason: 'focused_window_via_semantic_action',
      appName: target.appName,
      windowId,
    }
  }

  async moveResizeWindow(scene: DesktopScene, windowId: string, bounds: { x: number, y: number, width: number, height: number }): Promise<MoveResizeWindowResult> {
    const target = scene.windows.find(window => window.id === windowId)
    if (!target) {
      return {
        status: 'failed',
        reason: `window_not_found:${windowId}`,
      }
    }

    const setBoundsResult = await this.executeAction({
      kind: 'set_window_bounds',
      input: {
        windowId: target.id,
        windowNumber: target.windowNumber,
        ownerPid: target.ownerPid,
        bounds,
        observedBounds: target.bounds,
        appName: target.appName,
        title: target.title,
      },
    }, 'desktop_move_resize_window', {
      skipApprovalQueue: true,
    })

    const setBoundsErrorText = errorText(setBoundsResult)
    if (actionFailed(setBoundsResult)) {
      if (setBoundsErrorText.includes('unsupported') || setBoundsErrorText.includes('not implement')) {
        return {
          status: 'unsupported',
          reason: `set_window_bounds_unsupported:${windowId}`,
          notice: 'semantic_set_window_bounds_unavailable',
        }
      }

      return {
        status: 'failed',
        reason: `set_window_bounds_failed:${windowId}`,
        detail: setBoundsResult,
      }
    }

    return {
      status: 'completed',
      reason: 'set_window_bounds_completed',
      windowId,
    }
  }

  async runActionPlan(
    scene: DesktopScene,
    plan: DesktopActionPlan,
    options: {
      shouldContinue?: () => boolean
    } = {},
  ): Promise<DesktopActionPlanResult> {
    const details: Record<string, unknown>[] = []
    const errors: string[] = []

    let executedSteps = 0

    for (const step of plan.steps) {
      if (options.shouldContinue && !options.shouldContinue()) {
        return {
          status: 'interrupted',
          executedSteps,
          errors,
          details,
        }
      }

      switch (step.kind) {
        case 'focus_window': {
          const result = await this.focusWindow(scene, step.windowId)
          details.push({
            step,
            result,
          })
          if (result.status !== 'completed') {
            errors.push(result.reason)
            return {
              status: 'failed',
              executedSteps,
              errors,
              details,
            }
          }
          executedSteps += 1
          break
        }
        case 'move_resize_window': {
          const result = await this.moveResizeWindow(scene, step.windowId, step.bounds)
          details.push({
            step,
            result,
          })
          if (result.status === 'unsupported') {
            errors.push(result.reason)
            return {
              status: 'unsupported',
              executedSteps,
              errors,
              details,
            }
          }
          if (result.status !== 'completed') {
            errors.push(result.reason)
            return {
              status: 'failed',
              executedSteps,
              errors,
              details,
            }
          }
          executedSteps += 1
          break
        }
        case 'click': {
          const clickResult = await this.executeAction({
            kind: 'click',
            input: {
              x: step.x,
              y: step.y,
              button: step.button,
              clickCount: step.clickCount,
              captureAfter: false,
            },
          }, 'desktop_run_action_plan', {
            skipApprovalQueue: true,
          })

          details.push({
            step,
            result: clickResult,
          })

          if (actionFailed(clickResult)) {
            errors.push('click_step_failed')
            return {
              status: 'failed',
              executedSteps,
              errors,
              details,
            }
          }

          executedSteps += 1
          break
        }
        case 'wait': {
          const waitResult = await this.executeAction({
            kind: 'wait',
            input: {
              durationMs: step.durationMs,
              captureAfter: false,
            },
          }, 'desktop_run_action_plan', {
            skipApprovalQueue: true,
          })

          details.push({
            step,
            result: waitResult,
          })

          if (actionFailed(waitResult)) {
            errors.push('wait_step_failed')
            return {
              status: 'failed',
              executedSteps,
              errors,
              details,
            }
          }

          executedSteps += 1
          break
        }
      }
    }

    return {
      status: 'completed',
      executedSteps,
      errors,
      details,
    }
  }
}
