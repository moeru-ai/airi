import type { ExecuteAction } from '../server/action-executor'
import type { ComputerUseServerRuntime } from '../server/runtime'
import type {
  ControlLeaseKind,
  DesktopActionPlan,
  LayoutPresetId,
} from './types'

import { DesktopActionService } from './action-service'
import { ControlArbiter } from './control-arbiter'
import { GhostPointerService } from './ghost-pointer-service'
import { DesktopIntentService } from './intent-service'
import { DesktopSceneService } from './scene-service'

export class DesktopControlRuntime {
  readonly arbiter = new ControlArbiter()
  readonly ghostPointer = new GhostPointerService()
  readonly sceneService: DesktopSceneService
  readonly intentService = new DesktopIntentService()
  readonly actionService: DesktopActionService

  constructor(
    private readonly runtime: ComputerUseServerRuntime,
    executeAction: ExecuteAction,
  ) {
    this.sceneService = new DesktopSceneService(
      runtime.executor,
      () => runtime.session.getPointerPosition(),
    )
    this.actionService = new DesktopActionService(executeAction)
  }

  getControlState() {
    const { mode, lease } = this.arbiter.getState()
    return {
      mode,
      lease,
      ghostPointer: this.ghostPointer.getState(),
    }
  }

  requestLease(kind: ControlLeaseKind, ttlMs?: number) {
    return this.arbiter.requestLease(kind, ttlMs)
  }

  cancelLease(reason?: string) {
    return this.arbiter.cancelLease(reason)
  }

  reportUserInput() {
    return this.arbiter.notifyUserInput()
  }

  async observeScene() {
    const scene = await this.sceneService.observeScene()
    this.ghostPointer.followPointer(scene.pointer)
    return scene
  }

  observePointer() {
    const pointer = this.sceneService.getPointer()
    return this.ghostPointer.followPointer(pointer)
  }

  previewPointerMove(target: { x: number, y: number }, label?: string) {
    return this.ghostPointer.previewPointerMove(target, label)
  }

  async previewLayout(layoutId: LayoutPresetId, windowIds?: string[]) {
    const scene = await this.observeScene()
    return this.intentService.previewLayout(scene, layoutId, windowIds)
  }

  async applyLayout(layoutId: LayoutPresetId, windowIds?: string[]) {
    if (!this.arbiter.hasActiveLease('act')) {
      return {
        status: 'lease_required' as const,
        reason: 'act_lease_required_before_apply_layout',
      }
    }

    const scene = await this.observeScene()
    const preview = this.intentService.previewLayout(scene, layoutId, windowIds)

    if (preview.targets.length === 0) {
      this.ghostPointer.markError('layout_preview_has_no_targets')
      return {
        status: 'failed' as const,
        reason: 'layout_preview_has_no_targets',
        preview,
      }
    }

    const plan = this.intentService.toActionPlan(preview)
    const result = await this.actionService.runActionPlan(scene, plan, {
      shouldContinue: () => this.arbiter.hasActiveLease('act'),
    })

    if (result.status !== 'completed') {
      this.ghostPointer.markError('layout_apply_failed')
    }

    return {
      status: result.status,
      preview,
      plan,
      result,
    }
  }

  async focusWindow(windowId: string) {
    if (!this.arbiter.hasActiveLease('act')) {
      return {
        status: 'lease_required' as const,
        reason: 'act_lease_required_before_focus_window',
      }
    }

    const scene = await this.observeScene()
    const result = await this.actionService.focusWindow(scene, windowId)
    return {
      status: result.status,
      result,
    }
  }

  async moveResizeWindow(windowId: string, bounds: { x: number, y: number, width: number, height: number }) {
    if (!this.arbiter.hasActiveLease('act')) {
      return {
        status: 'lease_required' as const,
        reason: 'act_lease_required_before_move_resize',
      }
    }

    const scene = await this.observeScene()
    const result = await this.actionService.moveResizeWindow(scene, windowId, bounds)
    return {
      status: result.status,
      result,
    }
  }

  async runActionPlan(plan: DesktopActionPlan) {
    if (!this.arbiter.hasActiveLease('act')) {
      return {
        status: 'lease_required' as const,
        reason: 'act_lease_required_before_run_action_plan',
      }
    }

    const scene = await this.observeScene()
    const result = await this.actionService.runActionPlan(scene, plan, {
      shouldContinue: () => this.arbiter.hasActiveLease('act'),
    })

    return {
      status: result.status,
      result,
    }
  }
}

export function createDesktopControlRuntime(runtime: ComputerUseServerRuntime, executeAction: ExecuteAction) {
  return new DesktopControlRuntime(runtime, executeAction)
}
