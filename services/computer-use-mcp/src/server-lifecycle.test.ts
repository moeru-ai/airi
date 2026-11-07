import type { TerminalRunner } from './types'

import process from 'node:process'

import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { PassThrough } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import { startComputerUseMcpServer } from './server'
import { createTestConfig } from './test-fixtures'

vi.mock('node:process', async (original) => {
  const actual = await original<typeof import('node:process')>()
  const { PassThrough } = await import('node:stream')
  return { ...actual, default: { ...actual, stdin: new PassThrough(), stdout: new PassThrough(), once: vi.fn(), off: vi.fn() } }
})
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', async (original) => {
  const actual = await original<typeof import('@modelcontextprotocol/sdk/server/stdio.js')>()
  const { default: process } = await import('node:process')
  return { ...actual, StdioServerTransport: class extends actual.StdioServerTransport {
    constructor() { super(process.stdin, process.stdout) }
  } }
})

describe('stdio service lifetime', () => {
  it('drains owned direct Shells on EOF and closes once without fake close confirmation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-mcp-exit-'))
    let confirmClose!: () => void
    const closed = new Promise<void>((resolve) => {
      confirmClose = resolve
    })
    const close = vi.fn(() => closed)
    const runner: TerminalRunner = {
      describe: () => ({ kind: 'local-shell-runner', notes: [] }),
      getState: () => ({ effectiveCwd: root }),
      resetState: () => ({ effectiveCwd: root }),
      execute: vi.fn(),
      close,
    }
    const service = await startComputerUseMcpServer(createTestConfig({
      executor: 'dry-run',
      sessionRoot: root,
      auditLogPath: join(root, 'audit.jsonl'),
      screenshotsDir: root,
      browserDomBridge: { enabled: false, host: '127.0.0.1', port: 0, requestTimeoutMs: 1000 },
    }), { terminalRunnerFactory: () => runner })
    try {
      const protocolClose = vi.spyOn(service.server, 'close')
      const input = process.stdin
      if (!(input instanceof PassThrough))
        throw new Error('The fixture requires its controlled input stream.')
      const ended = once(input, 'end')
      input.end()
      await ended
      await Promise.resolve()
      expect(close).toHaveBeenCalledTimes(1)
      let finished = false
      const shutdown = service.shutdown().then(() => {
        finished = true
      })
      await Promise.resolve()
      expect(finished).toBe(false)
      confirmClose()
      await shutdown
      await service.shutdown()
      expect(protocolClose).toHaveBeenCalledTimes(1)
      console.info(JSON.stringify({ event: 'stdin-eof', runnerCloseRequests: close.mock.calls.length, protocolCloses: protocolClose.mock.calls.length, directShellDrainConfirmed: finished, nativeSpawn: 0 }))
    }
    finally {
      confirmClose()
      await service.shutdown()
      if (!resolve(root).startsWith(resolve(tmpdir()) + sep))
        throw new Error('Fixture cleanup escaped its temporary root.')
      await rm(root, { recursive: true, force: true })
    }
  })
})
