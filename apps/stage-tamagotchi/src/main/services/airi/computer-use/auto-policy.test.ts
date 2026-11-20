import type { TerminalSnapshot } from '@proj-airi/stage-shared/terminal-approval'

import { describe, expect, it } from 'vitest'

import { decideCommandAuto, decideComputerUseAuto, isAskReadOnlyCommand } from './auto-policy'

function snapshot(command: string, overrides: Partial<TerminalSnapshot> = {}): TerminalSnapshot {
  return {
    protocol: 'airi-terminal-approval/1',
    preparedId: 'prepared',
    requestId: 'request',
    toolCallId: 'call',
    command,
    shell: 'bash',
    argv: ['-lc', command],
    effectiveCwd: '/workspace/app',
    cwdSource: 'runner-state',
    executorPid: 10,
    executorPlatform: 'linux',
    executorCwd: '/workspace/app',
    timeoutMs: 1000,
    detached: false,
    windowsHide: false,
    ...overrides,
  }
}

describe('command auto cage', () => {
  it('allows a read-only command inside the workspace', () => {
    expect(decideCommandAuto(snapshot('pwd'), '/workspace/app')).toMatchObject({ outcome: 'allow' })
    expect(decideCommandAuto(snapshot('ls src'), '/workspace/app')).toMatchObject({ outcome: 'allow' })
    expect(decideCommandAuto(snapshot('git status -sb'), '/workspace/app')).toMatchObject({ outcome: 'allow' })
    expect(decideCommandAuto(snapshot('git diff'), '/workspace/app')).toMatchObject({ outcome: 'allow' })
    expect(decideCommandAuto(snapshot('git log'), '/workspace/app')).toMatchObject({ outcome: 'allow' })
    expect(decideCommandAuto(snapshot('git show'), '/workspace/app')).toMatchObject({ outcome: 'allow' })
  })

  it('allows PowerShell read-only commands inside the workspace', () => {
    const command = snapshot('Get-ChildItem', { executorPlatform: 'win32', effectiveCwd: 'C:\\work', executorCwd: 'C:\\work' })
    expect(decideCommandAuto(command, 'C:\\work')).toMatchObject({ outcome: 'allow' })
    expect(decideCommandAuto(snapshot('Get-Location', { executorPlatform: 'win32', effectiveCwd: 'C:\\work', executorCwd: 'C:\\work' }), 'C:\\work')).toMatchObject({ outcome: 'allow' })
  })

  it('reviews a write that stays inside the workspace', () => {
    expect(decideCommandAuto(snapshot('rm ./file'), '/workspace/app')).toMatchObject({
      outcome: 'review',
      card: { lane: 'terminal', cwd: '.', command: 'rm ./file' },
    })
  })

  it('refuses a command outside the workspace', () => {
    expect(decideCommandAuto(snapshot('pwd', { effectiveCwd: '/tmp' }), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('ls ../outside'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('rm /etc/passwd'), '/workspace/app').outcome).toBe('refuse')
  })

  it('refuses shell syntax that can hide another command', () => {
    expect(decideCommandAuto(snapshot('ls; rm file'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('ls $(whoami)'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('echo hi > out.txt'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('Get-ChildItem; Remove-Item a'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('powershell -EncodedCommand AAAA'), '/workspace/app').outcome).toBe('refuse')
  })

  it('refuses secrets and privileged commands', () => {
    expect(decideCommandAuto(snapshot('cat .env'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('cat ~/.ssh/id_rsa'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('sudo ls'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('shutdown /s'), '/workspace/app').outcome).toBe('refuse')
  })

  it('refuses a review card that is too long to send', () => {
    const command = `rm ${'a'.repeat(3000)}`
    expect(decideCommandAuto(snapshot(command), '/workspace/app')).toMatchObject({
      outcome: 'refuse',
      reason: 'The action card is too long to review.',
    })
  })
})

describe('ask read-only fast path', () => {
  it('recognizes only flag-only read commands', () => {
    expect(isAskReadOnlyCommand(snapshot('pwd'))).toBe(true)
    expect(isAskReadOnlyCommand(snapshot('ls -la'))).toBe(true)
    expect(isAskReadOnlyCommand(snapshot('git status -sb'))).toBe(true)
    expect(isAskReadOnlyCommand(snapshot('ls src'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('git status src'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('rm ./file'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('ls; pwd'))).toBe(false)
  })
})

describe('computer use auto cage', () => {
  it('allows scroll and wait only when the foreground window is visible', () => {
    expect(decideComputerUseAuto({ actionKind: 'scroll', contextAvailable: true, appName: 'Notes', windowTitle: 'Notes' })).toMatchObject({ outcome: 'allow' })
    expect(decideComputerUseAuto({ actionKind: 'wait', contextAvailable: true })).toMatchObject({ outcome: 'allow' })
    expect(decideComputerUseAuto({ actionKind: 'scroll', contextAvailable: false }).outcome).toBe('refuse')
  })

  it('reviews a click and keeps the window title on the card', () => {
    const notes = decideComputerUseAuto({
      actionKind: 'click',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { x: 4, y: 8 } },
    })
    const confirm = decideComputerUseAuto({
      actionKind: 'click',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Delete file?',
      action: { input: { x: 4, y: 8 } },
    })
    expect(notes).toMatchObject({ outcome: 'review', card: { windowTitle: 'Notes', detail: '4,8' } })
    expect(confirm).toMatchObject({ outcome: 'review', card: { windowTitle: 'Delete file?' } })
    expect(notes.outcome === 'review' && confirm.outcome === 'review' && notes.card.lane === 'computer_use' && confirm.card.lane === 'computer_use' && notes.card.windowTitle !== confirm.card.windowTitle).toBe(true)
  })

  it('refuses password managers, clipboard, secrets, and new terminals', () => {
    expect(decideComputerUseAuto({ actionKind: 'click', contextAvailable: true, appName: '1Password', windowTitle: 'Vault' }).outcome).toBe('refuse')
    expect(decideComputerUseAuto({ actionKind: 'clipboard_read_text', contextAvailable: true, windowTitle: 'Notes' }).outcome).toBe('refuse')
    expect(decideComputerUseAuto({ actionKind: 'secret_read_env_value', contextAvailable: true, windowTitle: 'Notes' }).outcome).toBe('refuse')
    expect(decideComputerUseAuto({ actionKind: 'pty_create', contextAvailable: true, windowTitle: 'Terminal' }).outcome).toBe('refuse')
  })

  it('sends the length of typed text instead of the text', () => {
    expect(decideComputerUseAuto({
      actionKind: 'type_text',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { text: 'secret phrase' } },
    })).toMatchObject({ outcome: 'review', card: { detail: 'chars:13' } })
  })
})
