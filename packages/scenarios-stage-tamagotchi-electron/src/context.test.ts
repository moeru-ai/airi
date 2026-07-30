import type { ScenarioContext } from '@vishot/source-electron'

import { describe, expect, it, vi } from 'vitest'

import { createStageTamagotchiScenarioContext, defineStageTamagotchiScenario } from './context.ts'

function createElectronApp(): ScenarioContext['electronApp'] {
  return Object.assign(Object.create(null), {
    windows: () => [],
  })
}

describe('createStageTamagotchiScenarioContext', () => {
  it('preserves the generic Vishot context while adding AIRI stage helpers', () => {
    const electronApp = createElectronApp()
    const capture = vi.fn()
    const context = createStageTamagotchiScenarioContext({
      capture,
      electronApp,
      outputDir: '/tmp/vishot',
    })

    expect(context.capture).toBe(capture)
    expect(context.electronApp).toBe(electronApp)
    expect(context.outputDir).toBe('/tmp/vishot')
    expect(context.stageWindows.waitFor).toEqual(expect.any(Function))
    expect(context.controlsIsland.openSettings).toEqual(expect.any(Function))
    expect(context.settingsWindow.goToRoute).toEqual(expect.any(Function))
    expect(context.dialogs.dismiss).toEqual(expect.any(Function))
    expect(context.drawers.swipeDown).toEqual(expect.any(Function))
  })
})

describe('defineStageTamagotchiScenario', () => {
  it('adapts generic Vishot scenarios to the AIRI stage helper context', async () => {
    const run = vi.fn()
    const scenario = defineStageTamagotchiScenario({
      id: 'settings-connection',
      run,
    })
    const genericContext = {
      capture: vi.fn(),
      electronApp: createElectronApp(),
      outputDir: '/tmp/vishot',
    }

    await scenario.run(genericContext)

    expect(scenario.id).toBe('settings-connection')
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0]?.[0].stageWindows.waitFor).toEqual(expect.any(Function))
  })
})
