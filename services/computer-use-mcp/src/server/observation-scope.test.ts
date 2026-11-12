import { platform } from 'node:process'

import { expect, it } from 'vitest'

import { createTestConfig } from '../test-fixtures'
import { createRuntime } from './runtime'

it.runIf(platform === 'win32')('keeps Terminal available while every native AUV observation entrance stays closed', async () => {
  const config = createTestConfig({ executor: 'auv' })
  config.browserDomBridge.enabled = false
  const runtime = await createRuntime(config)
  try {
    await expect(runtime.executor.observeWindows({ app: 'Fixture' })).rejects.toThrow('trusted observation scope')
    await expect(runtime.executor.takeScreenshot({ label: 'fixture' })).rejects.toThrow('trusted observation scope')
    expect(await runtime.executor.getForegroundContext()).toMatchObject({ available: false })
    expect(await runtime.executor.getDisplayInfo()).toMatchObject({ available: false })
    expect(runtime.terminalRunner.describe().kind).toBe('local-shell-runner')
    expect(runtime.terminalRunner.getState()).toBeDefined()
  }
  finally {
    await runtime.executor.close?.()
    await runtime.browserDomBridge.close()
    await runtime.cdpBridgeManager.close()
  }
})
