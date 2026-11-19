import type { RoutineQueryView } from '../../../shared/eventa/routines'
import type { RoutineWidgetMode } from '../../../shared/routine-widgets'
import type { WidgetsWindowManager } from '../../windows/widgets'
import type { RoutineRuntime } from './runtime'

import { projectRoutineWidget } from '../../../shared/routine-widgets'

export type RoutineWidgetsManager = Pick<WidgetsWindowManager, 'pushWidget' | 'updateWidget' | 'getWidgetSnapshot'>

/** Serializes profile queries and widget updates; window ownership and expiry stay in the existing manager. */
export class RoutineWidgets {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly runtime: Pick<RoutineRuntime, 'read'>, private readonly manager: RoutineWidgetsManager) {}

  /** Refresh only open cards after a committed change. A refresh never creates windows or extends expiry. */
  refresh(): Promise<void> {
    const next = this.queue.then(async () => {
      const modes = (['next', 'day'] as const).filter(mode => this.manager.getWidgetSnapshot(`routine:${mode}`))
      if (!modes.length)
        return
      const view = await this.runtime.read()
      for (const mode of modes) {
        const id = `routine:${mode}`
        const componentName = mode === 'next' ? 'routine-next' : 'routine-agenda'
        if (this.manager.getWidgetSnapshot(id)?.componentName !== componentName)
          continue
        await this.manager.updateWidget({ id, componentProps: { data: projectRoutineWidget(view, mode, Date.now()) }, alwaysOnTop: false })
      }
    }).catch(error => console.warn('[routines] Committed change could not refresh its card:', error))
    this.queue = next
    return next
  }

  query(mode: RoutineWidgetMode): Promise<RoutineQueryView> {
    const next = this.queue.then(async () => {
      const view = await this.runtime.read()
      const data = projectRoutineWidget(view, mode, Date.now())
      const id = `routine:${mode}`
      const payload = {
        id,
        componentName: mode === 'next' ? 'routine-next' : 'routine-agenda',
        componentProps: { data },
        alwaysOnTop: false,
        size: mode === 'next' ? 'm' as const : 'l' as const,
        windowSize: mode === 'next' ? { width: 380, height: 400 } : { width: 480, height: 640 },
        ttlMs: mode === 'next' ? 60000 : 120000,
      }
      try {
        const existing = this.manager.getWidgetSnapshot(id)
        if (existing && existing.componentName !== payload.componentName)
          throw new Error('routine-widget-id-collision')
        if (existing)
          await this.manager.updateWidget(payload)
        if (!this.manager.getWidgetSnapshot(id))
          await this.manager.pushWidget(payload)
        return { ...view, visualStatus: 'shown' as const }
      }
      catch (error) {
        console.warn('[routines] Widget unavailable:', error)
        return { ...view, visualStatus: 'unavailable' as const }
      }
    })
    this.queue = next.catch(() => {})
    return next
  }
}
