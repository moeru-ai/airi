import child_process from 'node:child_process'
import fs from 'node:fs/promises'

import { McpError } from '@modelcontextprotocol/sdk/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CodingPrimitives } from './primitives'

vi.mock('node:fs/promises')
vi.mock('node:child_process')

describe('codingPrimitives', () => {
  const mockConfig = {
    workspaceRoot: '/mock/workspace/root',
  }

  const mockRuntime = {
    config: mockConfig,
    stateManager: {
      updateCodingState: vi.fn(),
      getWorkspaceRoot: () => '/mock/workspace/root',
      getState: () => ({
        coding: {
          workspacePath: '/mock/workspace/root',
          recentReads: [],
          recentEdits: [],
          recentCommandResults: [],
        },
      }),
    },
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(child_process.exec).mockImplementation((cmd, options, callback) => {
      if (callback)
        callback(null, 'mock command output', '')
      return {} as any
    })
  })

  it('rejects path escape attempts in readFile', async () => {
    // @ts-expect-error mock runtime
    const primitives = new CodingPrimitives(mockRuntime)

    await expect(primitives.readFile('../outside.txt'))
      .rejects
      .toThrow(McpError)

    await expect(primitives.readFile('/mock/workspace/root2/file.txt'))
      .rejects
      .toThrow(McpError)
  })

  it('allows safe workspace paths', async () => {
    // @ts-expect-error mock runtime
    const primitives = new CodingPrimitives(mockRuntime)

    vi.mocked(fs.readFile).mockResolvedValue('file content')

    const result = await primitives.readFile('inside.txt')
    expect(result).toBe('file content')
  })

  it('provides compressContext deterministically', async () => {
    // @ts-expect-error mock runtime
    const primitives = new CodingPrimitives(mockRuntime)

    const snapshot = await primitives.compressContext('goal', 'files', 'results', 'issues', 'next')
    expect(snapshot).toEqual({
      goal: 'goal',
      filesSummary: 'files',
      recentResultSummary: 'results',
      unresolvedIssues: 'issues',
      nextStepRecommendation: 'next',
    })
  })

  it('infers deterministic auto context fields from coding and terminal state', async () => {
    const primitives = new CodingPrimitives({
      config: mockConfig,
      stateManager: {
        updateCodingState: mockRuntime.stateManager.updateCodingState,
        getWorkspaceRoot: mockRuntime.stateManager.getWorkspaceRoot,
        getState: () => ({
          coding: {
            workspacePath: '/mock/workspace/root',
            gitSummary: '',
            recentReads: [{ path: 'src/example.ts', range: 'all' }],
            recentEdits: [{ path: 'src/example.ts', summary: 'changed one branch' }],
            recentCommandResults: ['Command: pnpm test\nExit Code: 1\nStdout: fail\nStderr: stack'],
          },
          lastTerminalResult: {
            command: 'pnpm test',
            exitCode: 1,
            stdout: 'fail',
            stderr: 'stack',
            effectiveCwd: '/mock/workspace/root',
            durationMs: 42,
            timedOut: false,
          },
        }),
      },
    } as any)

    const snapshot = await primitives.compressContext('goal', 'auto', 'auto', 'auto', 'auto')
    expect(snapshot.filesSummary).toContain('Read src/example.ts (all)')
    expect(snapshot.filesSummary).toContain('Edited src/example.ts')
    expect(snapshot.recentResultSummary).toContain('Command: pnpm test')
    expect(snapshot.unresolvedIssues).toContain('exited with code 1')
    expect(snapshot.nextStepRecommendation).toContain('Inspect the failing validation output')
  })

  it('applies patch with matching literal string', async () => {
    // @ts-expect-error mock runtime
    const primitives = new CodingPrimitives(mockRuntime)

    vi.mocked(fs.readFile).mockResolvedValue('line 1\nline 2\nline 3\nline 4')
    vi.mocked(fs.writeFile).mockResolvedValue()

    const res = await primitives.applyPatch('target.txt', 'line 2\nline 3', 'line 2 modified\nline 3 modified')

    expect(res).toContain('successfully to target.txt')
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/mock/workspace/root/target.txt',
      'line 1\nline 2 modified\nline 3 modified\nline 4',
      'utf8',
    )
  })

  it('fails path check when applying patch to a different file escape', async () => {
    // @ts-expect-error mock runtime
    const primitives = new CodingPrimitives(mockRuntime)

    await expect(primitives.applyPatch('../test.txt', 'a', 'b')).rejects.toThrow(McpError)
  })

  it('reviewWorkspace preserves recent reads and commands instead of clearing', async () => {
    const primitives = new CodingPrimitives({
      config: mockConfig,
      stateManager: {
        updateCodingState: mockRuntime.stateManager.updateCodingState,
        getWorkspaceRoot: mockRuntime.stateManager.getWorkspaceRoot,
        getState: () => ({
          terminalState: {
            effectiveCwd: '/mock/workspace/root',
            lastExitCode: 1,
            lastCommandSummary: 'pnpm test',
          },
          lastTerminalResult: {
            command: 'pnpm test',
            exitCode: 1,
            stdout: 'fail',
            stderr: 'stack',
            effectiveCwd: '/mock/workspace/root',
            durationMs: 100,
            timedOut: false,
          },
          coding: {
            workspacePath: '/mock/workspace/root',
            gitSummary: '',
            recentReads: [{ path: 'test.ts', range: 'all' }],
            recentEdits: [{ path: 'test.ts', summary: 'test' }],
            recentCommandResults: ['Command: tests\nExit Code: 0'],
          },
        }),
      },
    } as any)

    const result = await primitives.reviewWorkspace('/mock/workspace/root')
    expect(mockRuntime.stateManager.updateCodingState).toHaveBeenCalled()
    expect(result.terminalSurface).toBe('exec')
    expect(result.terminalStateSummary).toMatchObject({
      effectiveCwd: '/mock/workspace/root',
      lastExitCode: 1,
      lastCommandSummary: 'pnpm test',
    })
    expect(result.recentReads.length).toBe(1)
    expect(result.recentCommandResults.length).toBe(1)
  })

  it('reviewWorkspace reports pty surface and pending issues for untouched workspace', async () => {
    const primitives = new CodingPrimitives({
      config: mockConfig,
      stateManager: {
        updateCodingState: mockRuntime.stateManager.updateCodingState,
        getWorkspaceRoot: mockRuntime.stateManager.getWorkspaceRoot,
        getState: () => ({
          activePtySessionId: 'pty_1',
          terminalState: {
            effectiveCwd: '/mock/workspace/root',
            lastExitCode: 0,
            lastCommandSummary: 'pwd',
          },
          coding: {
            workspacePath: '/mock/workspace/root',
            gitSummary: '',
            recentReads: [],
            recentEdits: [],
            recentCommandResults: [],
          },
        }),
      },
    } as any)

    const result = await primitives.reviewWorkspace('/mock/workspace/root')
    expect(result.terminalSurface).toBe('pty')
  })

  it('reportStatus can map "auto" strings into deterministic report fields', async () => {
    const primitives = new CodingPrimitives({
      config: mockConfig,
      stateManager: {
        updateCodingState: mockRuntime.stateManager.updateCodingState,
        getWorkspaceRoot: mockRuntime.stateManager.getWorkspaceRoot,
        getState: () => ({
          coding: {
            workspacePath: '/mock/workspace/root',
            gitSummary: '',
            recentReads: [{ path: 'test.ts', range: 'all' }],
            recentEdits: [{ path: 'test.ts', summary: 'test' }],
            recentCommandResults: ['Command: tests\nExit Code: 0\nStdout: ok\nStderr: none'],
          },
          lastTerminalResult: {
            command: 'tests',
            exitCode: 0,
            stdout: 'ok',
            stderr: 'none',
            effectiveCwd: '/mock/workspace/root',
            durationMs: 12,
            timedOut: false,
          },
        }),
      },
    } as any)

    const report = await primitives.reportStatus(
      'auto',
      'auto',
      ['auto'],
      ['auto'],
      ['auto'],
      'auto',
    )

    expect(report.status).toBe('completed')
    expect(report.summary).toContain('validated successfully with tests')
    expect(report.filesTouched).toContain('test.ts')
    expect(report.commandsRun[0]).toContain('Command: tests')
    expect(report.checks[0]).toContain('Exit Code: 0')
    expect(report.nextStep).toContain('Await the next instruction')
  })
})
