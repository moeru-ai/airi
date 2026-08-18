import type { CaptureExecutionResult, ManualCaptureStep, ManualRuntime } from './types'

import { sleep } from '@moeru/std'

import { ensureControlsIslandExpanded, getChatWindowSnapshot, getSettingsWindowSnapshot, waitForRouteReadiness } from './runtime'

async function captureStepPage(step: ManualCaptureStep, runtime: ManualRuntime): Promise<CaptureExecutionResult> {
  let page

  switch (step.kind) {
    case 'main-window': {
      page = runtime.mainWindow.page
      break
    }
    case 'controls-island': {
      await ensureControlsIslandExpanded(runtime)
      page = runtime.mainWindow.page
      break
    }
    case 'chat-window': {
      const chatWindowSnapshot = await getChatWindowSnapshot(runtime)

      if (step.readyPattern) {
        await chatWindowSnapshot.page.getByText(step.readyPattern).first().waitFor({ state: 'visible' })
      }

      page = chatWindowSnapshot.page
      break
    }
    case 'settings-overview': {
      const settingsWindowSnapshot = await getSettingsWindowSnapshot(runtime)

      if (step.readyPattern) {
        await settingsWindowSnapshot.page.getByText(step.readyPattern).first().waitFor({ state: 'visible' })
      }

      page = settingsWindowSnapshot.page
      break
    }
    case 'settings-route': {
      if (!step.routePath || !step.readyPattern) {
        throw new Error(`Step "${step.id}" requires both routePath and readyPattern.`)
      }

      const settingsWindowSnapshot = await waitForRouteReadiness(runtime, step.routePath, step.readyPattern)
      page = settingsWindowSnapshot.page
      break
    }
    case 'connection': {
      const settingsWindowSnapshot = await getSettingsWindowSnapshot(runtime)
      const websocketSettingsPage = await runtime.context.settingsWindow.goToConnection(settingsWindowSnapshot.page)

      if (step.readyPattern) {
        await websocketSettingsPage.getByText(step.readyPattern).waitFor({ state: 'visible' })
      }

      page = websocketSettingsPage
      break
    }
  }

  if (step.waitMs) {
    await sleep(step.waitMs)
  }

  const artifacts = await runtime.context.capture(step.rawCaptureName, page)

  return {
    artifacts,
  }
}

export async function runCaptureStep(step: ManualCaptureStep, runtime: ManualRuntime): Promise<CaptureExecutionResult> {
  return captureStepPage(step, runtime)
}
