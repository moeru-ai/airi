import type { ExecutorKind } from '../types'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveComputerUseConfig } from '../config'
import { createDryRunExecutor } from '../executors/dry-run'
import { createComputerUseMcpServer } from '../server'
import { createTestConfig } from '../test-fixtures'
import { createExecuteAction } from './action-executor'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const close of cleanups.splice(0).reverse())
    await close()
})

async function connect(executor: ExecutorKind = 'auv-wayland') {
  const root = await mkdtemp(join(tmpdir(), 'airi-wayland-'))
  cleanups.push(() => rm(root, { force: true, recursive: true }))
  const config = createTestConfig({
    executor,
    sessionRoot: root,
    auditLogPath: join(root, 'audit.jsonl'),
    screenshotsDir: join(root, 'screenshots'),
    approvalMode: 'actions',
    browserDomBridge: { enabled: false, host: '127.0.0.1', port: 0, requestTimeoutMs: 1000 },
  })
  const desktop = createDryRunExecutor(config)
  const getExecutionTarget = vi.fn(desktop.getExecutionTarget)
  const takeScreenshot = vi.fn().mockResolvedValue({
    dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pP8WwAAAABJRU5ErkJggg==',
    placeholder: false,
    width: 1,
    height: 1,
  })
  const { server, runtime, cdpCleanup } = await createComputerUseMcpServer(config, {
    executorFactory: () => ({
      ...desktop,
      takeScreenshot,
      getExecutionTarget,
      observeWindows: async () => { throw new Error('AT-SPI unavailable') },
    }),
  })
  const client = new Client({ name: 'wayland-fixture', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  cleanups.push(async () => {
    await client.close()
    await server.close()
    await cdpCleanup?.close()
    await runtime.cdpBridgeManager.close()
    await runtime.browserDomBridge.close()
    await runtime.terminalRunner.close?.()
  })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return { client, getExecutionTarget, takeScreenshot, runtime }
}

describe('observe-only AUV Wayland MCP', () => {
  it('selects the Wayland executor explicitly', () => {
    vi.stubEnv('COMPUTER_USE_EXECUTOR', 'auv-wayland')
    expect(resolveComputerUseConfig().executor).toBe('auv-wayland')
  })

  it('lists only observation and independent terminal tools', async () => {
    const { client } = await connect()
    const { tools } = await client.listTools()
    expect(tools.map(tool => tool.name).filter(name => !name.startsWith('terminal_') && !name.startsWith('pty_')).sort()).toEqual([
      'computer_observe',
      'computer_verify',
    ])
    expect(tools.map(tool => tool.name)).toContain('terminal_exec')
  })

  it('keeps the existing AUV desktop catalog', async () => {
    const { client } = await connect('auv')
    const { tools } = await client.listTools()
    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['computer_act', 'computer_observe', 'computer_verify', 'desktop_click', 'terminal_exec']))
  })

  it('returns a frame without window metadata and never verifies a failed capture from cache', async () => {
    const { client, takeScreenshot } = await connect()
    const observation = CallToolResultSchema.parse(await client.callTool({ name: 'computer_observe' }))
    expect(observation.content).toContainEqual(expect.objectContaining({ type: 'image', mimeType: 'image/png' }))
    expect(observation.structuredContent).toMatchObject({ status: 'ok', windowMetadataUnavailable: 'AT-SPI unavailable' })

    const verify = { name: 'computer_verify', arguments: { check: 'screenshot_ready' } }
    const success = CallToolResultSchema.parse(await client.callTool(verify))
    expect(success.structuredContent).toMatchObject({ status: 'verified' })

    takeScreenshot.mockRejectedValueOnce(new Error('Portal rejected capture'))
    const failure = CallToolResultSchema.parse(await client.callTool(verify))
    expect(failure.structuredContent).toMatchObject({ status: 'not_verified', observed: { available: false } })
    expect(takeScreenshot).toHaveBeenCalledTimes(3)
  })

  it('rejects direct mutation dispatch while Terminal can prepare without probing AUV', async () => {
    const { client, getExecutionTarget, runtime } = await connect()
    const executeAction = createExecuteAction(runtime)
    const denied = await executeAction({ kind: 'click', input: { x: 1, y: 1 } }, 'desktop_click', { skipApprovalQueue: true })
    expect(denied.structuredContent).toMatchObject({ status: 'denied' })

    const result = CallToolResultSchema.parse(await client.callTool({ name: 'terminal_exec', arguments: { command: 'echo ready' } }))
    expect(result.structuredContent).toMatchObject({ status: 'approval_required' })
    expect(getExecutionTarget).not.toHaveBeenCalled()
  })
})
