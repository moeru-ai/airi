import type { DesktopAgentBridge } from './executor'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { checkCommand, createExecutor, resolveInsideWorkspace } from './executor'

/** A bridge that answers from memory, so the tests never touch the machine. */
function createBridge(overrides: Partial<DesktopAgentBridge> = {}): DesktopAgentBridge {
  return {
    readdir: vi.fn(async () => []),
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    spawn: vi.fn(async () => ({
      done: Promise.resolve({ exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }),
      cancel: vi.fn(),
    })),
    screenCapture: vi.fn(async () => ({ width: 100, height: 100 })),
    windowList: vi.fn(async () => ['Editor', 'Browser']),
    windowFocus: vi.fn(async () => ({ text: 'Focused the editor.' })),
    openApplication: vi.fn(async () => ({ text: 'Opened notepad.' })),
    cursor: vi.fn(async () => ({ x: 0, y: 0, scale: 1.5 })),
    mouseMove: vi.fn(async () => undefined),
    mouseClick: vi.fn(async () => undefined),
    keyboardType: vi.fn(async () => undefined),
    keyboardPress: vi.fn(async () => undefined),
    ...overrides,
  }
}

const workspace = 'C:\\work\\agent'

describe('checkCommand', () => {
  it('accepts a program on the allow list', () => {
    expect(checkCommand('node', ['--version'])).toEqual({ ok: true })
    expect(checkCommand('git', ['status'])).toEqual({ ok: true })
  })

  it('refuses a program that is not on the allow list', () => {
    const result = checkCommand('curl', ['http://example.com'])
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.code).toBe('NOT_WHITELISTED')
  })

  it('refuses an argument that evaluates code', () => {
    for (const arg of ['-e', '--eval', '--exec=echo hi']) {
      const result = checkCommand('node', [arg])
      expect(result.ok, `expected ${arg} to be refused`).toBe(false)
    }
  })

  it('refuses an argument that replaces the program or the environment', () => {
    expect(checkCommand('npm', ['--prefix', '/tmp']).ok).toBe(false)
    expect(checkCommand('npm', ['--command', 'x']).ok).toBe(false)
    expect(checkCommand('npm', ['-g']).ok).toBe(false)
    expect(checkCommand('npm', ['--global']).ok).toBe(false)
    expect(checkCommand('rm', ['-f']).ok).toBe(false)
  })

  it('refuses a shell operator in an argument', () => {
    for (const arg of ['a;b', 'a&b', 'a|b', 'a`b', 'a$b', 'a>b', 'a<b']) {
      const result = checkCommand('node', [arg])
      expect(result.ok, `expected ${arg} to be refused`).toBe(false)
      expect(result.ok === false && result.code).toBe('SHELL_META')
    }
  })

  it('refuses a line break or a null character in an argument', () => {
    expect(checkCommand('node', ['a\nb']).ok).toBe(false)
    expect(checkCommand('node', ['a\0b']).ok).toBe(false)
  })

  it('refuses a script file path', () => {
    const result = checkCommand('build.cmd', [])
    expect(result.ok).toBe(false)
  })

  it('refuses git push, which belongs to a dedicated tool', () => {
    const result = checkCommand('git', ['push'])
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.code).toBe('GIT_PUSH')
  })

  it('accepts -c, which pip and gradle use as an ordinary flag', () => {
    expect(checkCommand('pip', ['-c'])).toEqual({ ok: true })
  })

  it('refuses an empty program', () => {
    expect(checkCommand('', []).ok).toBe(false)
  })
})

describe('resolveInsideWorkspace', () => {
  it('resolves a relative path inside the workspace', () => {
    expect(resolveInsideWorkspace(workspace, 'src/index.ts')).toBe('C:\\work\\agent\\src\\index.ts')
  })

  it('treats an empty path as the workspace root', () => {
    expect(resolveInsideWorkspace(workspace, '')).toBe(workspace)
  })

  it('refuses a path that walks out of the workspace', () => {
    expect(() => resolveInsideWorkspace(workspace, '../secrets.txt')).toThrow(/leaves the workspace/)
  })

  it('refuses an absolute path outside the workspace', () => {
    expect(() => resolveInsideWorkspace(workspace, 'C:\\Windows\\System32')).toThrow(/leaves the workspace/)
  })

  it('refuses a null character', () => {
    expect(() => resolveInsideWorkspace(workspace, 'a\0b')).toThrow(/null character/)
  })

  it('refuses a missing workspace', () => {
    expect(() => resolveInsideWorkspace('', 'a')).toThrow(/not set/)
  })
})

describe('read tools', () => {
  let bridge: DesktopAgentBridge

  beforeEach(() => {
    bridge = createBridge()
  })

  it('numbers the lines and reports the remaining count', async () => {
    bridge.readFile = vi.fn(async () => 'one\ntwo\nthree\nfour')
    const executor = createExecutor({ workspace, bridge })

    const result = await executor.read_file({ path: 'notes.txt', offset: 2, limit: 2 })
    expect(result).toContain('    2| two')
    expect(result).toContain('    3| three')
    expect(result).not.toContain('four')
    expect(result).toContain('the file holds 4 lines in total')
  })

  it('lists a directory and marks directories with a slash', async () => {
    bridge.readdir = vi.fn(async () => [
      { name: 'src', isDirectory: true },
      { name: 'readme.md', isDirectory: false },
    ])
    const executor = createExecutor({ workspace, bridge })

    const result = await executor.list_files({ path: '.', depth: 1 })
    expect(result).toContain('src/')
    expect(result).toContain('readme.md')
  })

  it('reports no match instead of an empty string', async () => {
    bridge.readdir = vi.fn(async () => [{ name: 'a.ts', isDirectory: false }])
    bridge.readFile = vi.fn(async () => 'nothing here')
    const executor = createExecutor({ workspace, bridge })

    expect(await executor.search_files({ query: 'needle' })).toContain('Nothing under the workspace')
  })

  it('reports the location of a match', async () => {
    bridge.readdir = vi.fn(async () => [{ name: 'a.ts', isDirectory: false }])
    bridge.readFile = vi.fn(async () => 'first\nconst needle = 1\n')
    const executor = createExecutor({ workspace, bridge })

    expect(await executor.search_files({ query: 'needle' })).toContain('a.ts:2:')
  })
})

describe('write tools', () => {
  it('writes the whole file and reports the size', async () => {
    const bridge = createBridge()
    const executor = createExecutor({ workspace, bridge })

    const result = await executor.write_file({ path: 'out.txt', content: 'hello' })
    expect(result).toContain('out.txt')
    expect(bridge.writeFile).toHaveBeenCalledWith('C:\\work\\agent\\out.txt', 'hello')
  })

  it('patches one unique occurrence', async () => {
    const bridge = createBridge({ readFile: vi.fn(async () => 'alpha beta gamma') })
    const executor = createExecutor({ workspace, bridge })

    await executor.apply_patch({ path: 'a.txt', old: 'beta', new: 'BETA' })
    expect(bridge.writeFile).toHaveBeenCalledWith('C:\\work\\agent\\a.txt', 'alpha BETA gamma')
  })

  it('refuses a patch whose text is absent', async () => {
    const bridge = createBridge({ readFile: vi.fn(async () => 'alpha') })
    const executor = createExecutor({ workspace, bridge })

    await expect(executor.apply_patch({ path: 'a.txt', old: 'beta', new: 'B' })).rejects.toThrow(/not in/)
  })

  it('refuses a patch whose text occurs twice', async () => {
    const bridge = createBridge({ readFile: vi.fn(async () => 'beta beta') })
    const executor = createExecutor({ workspace, bridge })

    await expect(executor.apply_patch({ path: 'a.txt', old: 'beta', new: 'B' })).rejects.toThrow(/more than once/)
  })

  it('refuses a path outside the workspace before it writes', async () => {
    const bridge = createBridge()
    const executor = createExecutor({ workspace, bridge })

    await expect(executor.write_file({ path: '../escape.txt', content: 'x' })).rejects.toThrow(/leaves the workspace/)
    expect(bridge.writeFile).not.toHaveBeenCalled()
  })
})

describe('run_command', () => {
  it('refuses a policy violation before it spawns anything', async () => {
    const bridge = createBridge()
    const executor = createExecutor({ workspace, bridge })

    await expect(executor.run_command({ command: 'curl', args: ['http://example.com'] })).rejects.toThrow(/policy/)
    expect(bridge.spawn).not.toHaveBeenCalled()
  })

  it('reports the output and the exit code', async () => {
    const bridge = createBridge()
    const executor = createExecutor({ workspace, bridge })

    const result = await executor.run_command({ command: 'node', args: ['--version'] })
    expect(result).toContain('ok')
    expect(result).toContain('exit code 0')
  })

  it('reports a timeout', async () => {
    const bridge = createBridge({
      spawn: vi.fn(async () => ({
        done: Promise.resolve({ exitCode: -1, stdout: '', stderr: '', timedOut: true }),
        cancel: vi.fn(),
      })),
    })
    const executor = createExecutor({ workspace, bridge })

    expect(await executor.run_command({ command: 'node', args: [] })).toContain('stopped by the timeout')
  })
})

describe('machine control', () => {
  it('scales logical coordinates by the display scale', async () => {
    const bridge = createBridge()
    const executor = createExecutor({ workspace, bridge })

    const result = await executor.mouse_move({ x: 100, y: 200 })
    expect(bridge.mouseMove).toHaveBeenCalledWith({ x: 150, y: 300 })
    expect(result).toContain('1.5x scale')
  })

  it('accepts a URL and refuses a path for open_application', async () => {
    const bridge = createBridge()
    const executor = createExecutor({ workspace, bridge })

    await executor.open_application({ target: 'https://example.com' })
    expect(bridge.openApplication).toHaveBeenCalledWith({ target: 'https://example.com', isUrl: true })

    await expect(executor.open_application({ target: 'C:\\Windows\\notepad.exe' })).rejects.toThrow(/program name/)
  })

  it('refuses an empty or oversized keyboard text', async () => {
    const executor = createExecutor({ workspace, bridge: createBridge() })
    await expect(executor.keyboard_type({ text: '' })).rejects.toThrow(/needs text/)
    await expect(executor.keyboard_type({ text: 'a'.repeat(2001) })).rejects.toThrow(/2000/)
  })

  it('refuses an unknown mouse button', async () => {
    const executor = createExecutor({ workspace, bridge: createBridge() })
    await expect(executor.mouse_click({ button: 'side' })).rejects.toThrow(/left, right, or middle/)
  })

  it('lists the window titles', async () => {
    const executor = createExecutor({ workspace, bridge: createBridge() })
    expect(await executor.window_list()).toContain('1. Editor')
  })
})

describe('capability guard', () => {
  it('names the capability the host does not provide', async () => {
    const bridge = createBridge({ windowList: undefined as never })
    const executor = createExecutor({ workspace, bridge })

    await expect(executor.window_list()).rejects.toThrow(/does not provide this capability: windowList/)
  })
})

describe('sensitive paths', () => {
  it('refuses a credential file inside the workspace', async () => {
    const bridge = createBridge()
    const executor = createExecutor({
      workspace,
      bridge,
      isSensitive: path => path.endsWith('.npmrc'),
    })

    await expect(executor.read_file({ path: '.npmrc' })).rejects.toThrow(/credentials or settings/)
  })
})

describe('cancellation', () => {
  it('tracks a running command and cancels it', async () => {
    const cancel = vi.fn()
    let finish: ((value: { exitCode: number, stdout: string, stderr: string, timedOut: boolean }) => void) | undefined
    const bridge = createBridge({
      spawn: vi.fn(async () => ({
        done: new Promise<{ exitCode: number, stdout: string, stderr: string, timedOut: boolean }>((resolve) => {
          finish = resolve
        }),
        cancel,
      })),
    })
    const executor = createExecutor({ workspace, bridge })

    const pending = executor.run_command({ command: 'node', args: [] })
    await Promise.resolve()
    expect(executor.runningCount()).toBe(1)
    expect(executor.cancelAll()).toBe(1)
    expect(cancel).toHaveBeenCalledOnce()

    finish?.({ exitCode: -1, stdout: '', stderr: '', timedOut: false })
    await pending
    expect(executor.runningCount()).toBe(0)
  })
})
