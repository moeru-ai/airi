import type { ManualRuntime } from './shared/types.ts'

import { defineStageTamagotchiScenario } from '../../context.ts'
import { manualCaptureSections } from './manifest.ts'
import { formatStepFailure, resetScenarioOutputDirectories } from './shared/output.ts'
import { runCaptureStep } from './shared/steps.ts'

export default defineStageTamagotchiScenario({
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
