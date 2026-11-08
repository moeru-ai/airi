import { platform } from 'node:process'

import { expect, it, vi } from 'vitest'

import { createTestConfig } from '../test-fixtures'
import { createRuntime } from './runtime'

const native = vi.hoisted(() => ({ start: vi.fn() }))
vi.mock('@auv-js/sdk/node', () => ({ startAuv: native.start }))

it.runIf(platform === 'win32')('keeps Terminal available while every native AUV observation entrance stays closed', async () => {
  const config = createTestConfig({ executor: 'auv' })
  config.browserDomBridge.enabled = false
  const runtime = await createRuntime(config)
  try {
    await expect(runtime.executor.observeWindows({ app: 'Fixture' })).rejects.toThrow('trusted observation scope')
    expect(await runtime.executor.getForegroundContext()).toMatchObject({ available: false })
    expect(await runtime.executor.getDisplayInfo()).toMatchObject({ available: false })
    expect(runtime.terminalRunner.describe().kind).toBe('local-shell-runner')
    expect(runtime.terminalRunner.getState()).toBeDefined()
    expect(native.start).not.toHaveBeenCalled()
    console.info(JSON.stringify({ boundary: 'MCP runtime with AUV configuration', daemonStarts: native.start.mock.calls.length, terminalAvailable: true }))
  }
  finally {
    await runtime.executor.close?.()
    await runtime.browserDomBridge.close()
    await runtime.cdpBridgeManager.close()
  }
})
