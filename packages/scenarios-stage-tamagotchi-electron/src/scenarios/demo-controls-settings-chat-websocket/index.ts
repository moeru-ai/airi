import type { ManualRuntime } from './shared/types'

import { defineScenario } from '@proj-airi/vishot-runner-electron'

import { manualCaptureSections } from './manifest'
import { formatStepFailure, resetScenarioOutputDirectories } from './shared/output'
import { runCaptureStep } from './shared/steps'

export default defineScenario({
  id: 'demo-controls-settings-chat-websocket',
  async run(context) {
    const mainWindow = await context.stageWindows.waitFor('main')
    await context.controlsIsland.waitForReady(mainWindow.page)

    const runtime: ManualRuntime = {
      context,
      mainWindow,
    }

    await resetScenarioOutputDirectories()

    for (const section of manualCaptureSections) {
      for (const step of section.steps) {
        try {
          await runCaptureStep(step, runtime)
        }
        catch (error) {
          throw formatStepFailure(section.id, step.id, error)
        }
      }
    }
  },
})
