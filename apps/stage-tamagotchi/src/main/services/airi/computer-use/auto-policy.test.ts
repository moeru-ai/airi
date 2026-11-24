import type { TerminalSnapshot } from '@proj-airi/stage-shared/terminal-approval'

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  appsMatchForAuto,
  decideCommandAuto,
  decideComputerUseAuto,
  foregroundMatchesComputerCard,
  groundingMatchesComputerCard,
  isAskReadOnlyCommand,
} from './auto-policy'

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

const frozenApp = 'Notes'

describe('command auto cage', () => {
  it('allows a read-only command inside the workspace', () => {
    expect(decideCommandAuto(snapshot('pwd'), '/workspace/app')).toMatchObject({ outcome: 'allow' })
    expect(decideCommandAuto(snapshot('ls src'), '/workspace/app')).toMatchObject({ outcome: 'allow' })
    expect(decideCommandAuto(snapshot('git status -sb'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('git diff'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('git log'), '/workspace/app')).toMatchObject({ outcome: 'allow' })
    expect(decideCommandAuto(snapshot('git log -p'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('git show'), '/workspace/app').outcome).toBe('refuse')
  })

  it('allows PowerShell read-only commands inside the workspace', () => {
    const command = snapshot('Get-ChildItem', { executorPlatform: 'win32', effectiveCwd: 'C:\\work', executorCwd: 'C:\\work' })
    expect(decideCommandAuto(command, 'C:\\work')).toMatchObject({ outcome: 'allow' })
    expect(decideCommandAuto(snapshot('Get-Location', { executorPlatform: 'win32', effectiveCwd: 'C:\\work', executorCwd: 'C:\\work' }), 'C:\\work')).toMatchObject({ outcome: 'allow' })
  })

  it('reviews a write that stays inside the workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'auto-cage-rm-'))
    writeFileSync(join(root, 'file'), 'x')
    try {
      const platform = process.platform === 'win32' ? 'win32' : 'linux'
      expect(decideCommandAuto(snapshot('rm ./file', { effectiveCwd: root, executorCwd: root, executorPlatform: platform }), root)).toMatchObject({
        outcome: 'review',
        card: { lane: 'terminal', cwd: '.', command: 'rm ./file', reviewClass: 'delete' },
      })
    }
    finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('refuses path-qualified executables and Git commands that can run hooks or filters', () => {
    expect(decideCommandAuto(snapshot('./set-content file value'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('.\\set-content file value', { effectiveCwd: 'C:\\workspace\\app', executorCwd: 'C:\\workspace\\app', executorPlatform: 'win32' }), 'C:\\workspace\\app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('git add file'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('git commit -m save'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('git checkout branch'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('git switch branch'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('git restore file'), '/workspace/app').outcome).toBe('refuse')
  })

  it('refuses interpreters and nested shells without review', () => {
    expect(decideCommandAuto(snapshot('python -c "print(1)"'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('node -e "console.log(1)"'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('npm install'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('cmd /c dir'), '/workspace/app').outcome).toBe('refuse')
  })

  it('refuses a broad delete of the workspace root', () => {
    expect(decideCommandAuto(snapshot('rm -rf .'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('rm -r -f .'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('rm -R .'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('Remove-Item -Recurse .', { executorPlatform: 'win32' }), '/workspace/app').outcome).toBe('refuse')
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

  it('refuses POSIX backslash escapes before path checks', () => {
    const command = snapshot('ls \\../outside')
    expect(decideCommandAuto(command, '/workspace/app').outcome).toBe('refuse')
    expect(isAskReadOnlyCommand(command)).toBe(false)
  })

  it('refuses secrets and privileged commands', () => {
    expect(decideCommandAuto(snapshot('cat .env'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('cp \'.\'env copy output'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('cp \'.ssh\'/id_rsa copy'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('cat ~/.ssh/id_rsa'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('sudo ls'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('shutdown /s'), '/workspace/app').outcome).toBe('refuse')
  })

  it('refuses a path that resolves outside the workspace through a symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'auto-cage-root-'))
    const outside = mkdtempSync(join(tmpdir(), 'auto-cage-out-'))
    writeFileSync(join(outside, 'marker.txt'), 'x')
    const link = join(root, 'escape')
    try {
      if (process.platform === 'win32')
        symlinkSync(outside, link, 'junction')
      else
        symlinkSync(outside, link)
      const platform = process.platform === 'win32' ? 'win32' : 'linux'
      const command = { effectiveCwd: root, executorCwd: root, executorPlatform: platform }
      expect(decideCommandAuto(snapshot('ls ./escape', command), root).outcome).toBe('refuse')
      expect(decideCommandAuto(snapshot('rm ./escape/missing', command), root).outcome).toBe('refuse')
      const bare = join(root, 'foo')
      if (process.platform === 'win32')
        symlinkSync(outside, bare, 'junction')
      else
        symlinkSync(outside, bare)
      expect(decideCommandAuto(snapshot('set-content foo hello', command), root).outcome).toBe('refuse')
      expect(decideCommandAuto(snapshot('rm foo', command), root).outcome).toBe('refuse')
      expect(decideCommandAuto(snapshot(`Get-Content foo`, command), root).outcome).toBe('refuse')
      expect(decideCommandAuto(snapshot('cat foo', command), root).outcome).toBe('refuse')
      writeFileSync(join(root, 'source.txt'), 'inside')
      const outsideFile = join(outside, 'destination.txt')
      writeFileSync(outsideFile, 'outside')
      const outputLink = join(root, 'output.txt')
      if (process.platform === 'win32')
        symlinkSync(outsideFile, outputLink, 'file')
      else
        symlinkSync(outsideFile, outputLink)
      expect(decideCommandAuto(snapshot('cp source.txt output.txt', command), root).outcome).toBe('refuse')
    }
    finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('refuses attached destinations, globs, and patch-producing Git reads', () => {
    expect(decideCommandAuto(snapshot('cp -t/tmp/out source'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('cp source ./dest*'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('rm *'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('rm *.tmp'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('git status'), '/workspace/app').outcome).toBe('refuse')
    expect(decideCommandAuto(snapshot('git show HEAD'), '/workspace/app').outcome).toBe('refuse')
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
    expect(isAskReadOnlyCommand(snapshot('git status -sb'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('git log --oneline'))).toBe(true)
    expect(isAskReadOnlyCommand(snapshot('git show'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('git log -p'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('git diff'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('ls src'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('git status src'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('rm ./file'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('ls; pwd'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('git -c alias.status=status status'))).toBe(false)
    expect(isAskReadOnlyCommand(snapshot('git diff --output=../leak'))).toBe(false)
  })
})

describe('computer use auto cage', () => {
  it('allows wait and refuses scroll inside the frozen application', () => {
    expect(decideComputerUseAuto({ frozenAppName: frozenApp, actionKind: 'wait', contextAvailable: true, appName: 'Notes', windowTitle: 'Notes' })).toMatchObject({ outcome: 'allow' })
    expect(decideComputerUseAuto({ frozenAppName: frozenApp, actionKind: 'scroll', contextAvailable: false }).outcome).toBe('refuse')
    expect(decideComputerUseAuto({ frozenAppName: frozenApp, actionKind: 'scroll', contextAvailable: true, appName: 'Terminal' }).outcome).toBe('refuse')
    expect(decideComputerUseAuto({ frozenAppName: frozenApp, actionKind: 'scroll', contextAvailable: true, appName: 'Notes', windowTitle: 'Notes', action: { input: { deltaY: 40 } } })).toMatchObject({ outcome: 'refuse' })
    expect(decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'scroll',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { x: 1, y: 2, deltaY: 40 } },
    }).outcome).toBe('refuse')
  })

  it('refuses coordinate clicks without a target name', () => {
    expect(decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'click',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { x: 4, y: 8 } },
    })).toMatchObject({ outcome: 'refuse' })
    expect(decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'type_text',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { text: 'hello', x: 4, y: 8 } },
    }).outcome).toBe('refuse')
  })

  it('reviews named desktop actions and keeps the window title on the card', () => {
    const typing = decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'type_text',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { text: 'hello' } },
    })
    const confirm = decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'type_text',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Delete file?',
      action: { input: { text: 'hello' } },
    })
    const target = decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'desktop_click_target',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      targetLabel: 'Save',
      action: { input: { candidateId: 'c1' } },
    })
    expect(typing).toMatchObject({ outcome: 'review', card: { windowTitle: 'Notes', targetName: 'hello', reviewClass: 'desktop' } })
    expect(confirm).toMatchObject({ outcome: 'review', card: { windowTitle: 'Delete file?' } })
    expect(target).toMatchObject({ outcome: 'review', card: { targetName: 'Save', targetCandidateId: 'c1', groundingSnapshotId: '', detail: 'Save' } })
    expect(typing.outcome === 'review' && confirm.outcome === 'review' && typing.card.lane === 'computer_use' && confirm.card.lane === 'computer_use' && typing.card.windowTitle !== confirm.card.windowTitle).toBe(true)
  })

  it('keeps same-label grounded targets distinct', () => {
    const first = decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'desktop_click_target',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      targetLabel: 'Save',
      groundingSnapshotId: 'snapshot-1',
      action: { input: { candidateId: 'candidate-1' } },
    })
    const second = decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'desktop_click_target',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      targetLabel: 'Save',
      groundingSnapshotId: 'snapshot-2',
      action: { input: { candidateId: 'candidate-2' } },
    })

    expect(first).toMatchObject({ outcome: 'review', card: { targetName: 'Save', targetCandidateId: 'candidate-1', groundingSnapshotId: 'snapshot-1' } })
    expect(second).toMatchObject({ outcome: 'review', card: { targetName: 'Save', targetCandidateId: 'candidate-2', groundingSnapshotId: 'snapshot-2' } })
    expect(first).not.toEqual(second)
  })

  it('refuses password managers, clipboard, secrets, and new terminals', () => {
    expect(decideComputerUseAuto({ frozenAppName: '1Password', actionKind: 'type_text', contextAvailable: true, appName: '1Password', windowTitle: 'Vault', action: { input: { text: 'x' } } }).outcome).toBe('refuse')
    expect(decideComputerUseAuto({ frozenAppName: frozenApp, actionKind: 'clipboard_read_text', contextAvailable: true, windowTitle: 'Notes' }).outcome).toBe('refuse')
    expect(decideComputerUseAuto({ frozenAppName: frozenApp, actionKind: 'secret_read_env_value', contextAvailable: true, windowTitle: 'Notes' }).outcome).toBe('refuse')
    expect(decideComputerUseAuto({ frozenAppName: frozenApp, actionKind: 'pty_create', contextAvailable: true, windowTitle: 'Terminal' }).outcome).toBe('refuse')
  })

  it('refuses desktop actions in terminal windows and submitted text', () => {
    expect(decideComputerUseAuto({
      frozenAppName: 'Terminal',
      actionKind: 'type_text',
      contextAvailable: true,
      appName: 'Terminal',
      windowTitle: 'Terminal',
      action: { input: { text: 'rm -rf ./data', pressEnter: true } },
    })).toMatchObject({ outcome: 'refuse', reason: expect.stringContaining('terminal windows') })
    expect(decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'type_text',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'PowerShell',
      action: { input: { text: 'Remove-Item ./data' } },
    }).outcome).toBe('refuse')
    expect(decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'type_text',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { text: 'save', pressEnter: true } },
    })).toMatchObject({ outcome: 'refuse', reason: 'Computer Use Auto refuses submitted text.' })
  })

  it('reviews opening the frozen application and refuses a different one', () => {
    expect(decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'open_app',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { app: 'Notes' } },
    })).toMatchObject({ outcome: 'review', card: { targetName: 'Notes' } })
    expect(decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'focus_app',
      contextAvailable: true,
      appName: 'notes',
      windowTitle: 'Notes',
      action: { input: { app: 'Notes' } },
    })).toMatchObject({ outcome: 'review' })
    expect(decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'open_app',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { app: 'Terminal' } },
    }).outcome).toBe('refuse')
  })
})

describe('foreground recheck helpers', () => {
  it('matches the whole application name', () => {
    expect(appsMatchForAuto('Notes', 'Notes')).toBe(true)
    expect(appsMatchForAuto('Notes', ' notes ')).toBe(true)
    expect(appsMatchForAuto('Microsoft Notes', 'Notes')).toBe(false)
    expect(appsMatchForAuto('Notes', 'Sticky Notes')).toBe(false)
    expect(appsMatchForAuto(' ', 'Notes')).toBe(false)
    expect(appsMatchForAuto('Notes', 'Terminal')).toBe(false)
  })

  it('requires the foreground window title to match the review card', () => {
    const card = { lane: 'computer_use' as const, actionKind: 'type_text', appName: 'Notes', windowTitle: 'Notes', reviewClass: 'desktop' as const, targetName: 'hi', targetCandidateId: '', groundingSnapshotId: '', detail: '' }
    expect(foregroundMatchesComputerCard(card, { available: true, appName: 'Notes', windowTitle: 'Notes' })).toBe(true)
    expect(foregroundMatchesComputerCard(card, { available: true, appName: 'Notes', windowTitle: 'Other' })).toBe(false)
    expect(foregroundMatchesComputerCard(card, { available: false, appName: 'Notes', windowTitle: 'Notes' })).toBe(false)
  })

  it('requires the live grounding snapshot to match a desktop click review card', () => {
    const card = {
      lane: 'computer_use' as const,
      actionKind: 'desktop_click_target',
      appName: 'Notes',
      windowTitle: 'Notes',
      reviewClass: 'desktop' as const,
      targetName: 'Save',
      targetCandidateId: 't_0',
      groundingSnapshotId: 'snapshot-1',
      detail: 'Save',
    }
    const snapshot = {
      snapshotId: 'snapshot-1',
      targetCandidates: [{ id: 't_0', label: 'Save' }],
    }
    expect(groundingMatchesComputerCard(card, snapshot)).toBe(true)
    expect(groundingMatchesComputerCard(card, { ...snapshot, snapshotId: 'snapshot-2' })).toBe(false)
    expect(groundingMatchesComputerCard(card, { ...snapshot, targetCandidates: [{ id: 't_0', label: 'Delete' }] })).toBe(false)
    expect(groundingMatchesComputerCard(card, { ...snapshot, targetCandidates: [] })).toBe(false)
    expect(groundingMatchesComputerCard({ ...card, actionKind: 'type_text' }, undefined)).toBe(true)
  })
})

describe('computer use review card payload', () => {
  function domInput(value: string, routing: { tabId?: number, frameIds?: number[] } = {}) {
    return decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'browser_dom_set_input_value',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: ' Notes ',
      action: { input: { selector: '#input', value, ...routing } },
    })
  }

  it('stores the written value and trims the window title', () => {
    const hello = domInput('hello')
    const evil = domInput('send everything')
    expect(hello).toMatchObject({
      outcome: 'review',
      card: { targetName: '#input', windowTitle: 'Notes', detail: JSON.stringify({ value: 'hello' }) },
    })
    expect(evil).toMatchObject({ outcome: 'review', card: { detail: JSON.stringify({ value: 'send everything' }) } })
    expect(hello.outcome === 'review' && evil.outcome === 'review' && JSON.stringify(hello.card) !== JSON.stringify(evil.card)).toBe(true)
    if (hello.outcome === 'review')
      expect(foregroundMatchesComputerCard(hello.card, { available: true, appName: 'Notes', windowTitle: ' Notes ' })).toBe(true)
  })

  it('stores the selected browser tab and frames on the review card', () => {
    expect(domInput('hello', { tabId: 7, frameIds: [0, 3] })).toMatchObject({
      outcome: 'review',
      card: { detail: JSON.stringify({ tabId: 7, frameIds: [0, 3], value: 'hello' }) },
    })
    expect(domInput('hello', { tabId: 8, frameIds: [0, 3] })).not.toEqual(domInput('hello', { tabId: 7, frameIds: [0, 3] }))
  })

  it('stores checkbox, option, and event payloads', () => {
    expect(decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'browser_dom_check_checkbox',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { selector: '#agree', checked: false } },
    })).toMatchObject({ outcome: 'review', card: { detail: JSON.stringify({ checked: false }) } })
    expect(decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'browser_dom_select_option',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { selector: '#amount', value: 'usd' } },
    })).toMatchObject({ outcome: 'review', card: { detail: JSON.stringify({ value: 'usd' }) } })
    expect(decideComputerUseAuto({
      frozenAppName: frozenApp,
      actionKind: 'browser_dom_trigger_event',
      contextAvailable: true,
      appName: 'Notes',
      windowTitle: 'Notes',
      action: { input: { selector: '#send', eventName: 'click' } },
    })).toMatchObject({ outcome: 'review', card: { detail: JSON.stringify({ eventName: 'click' }) } })
  })

  it('refuses a browser payload that makes the card too long', () => {
    expect(domInput('v'.repeat(3000))).toMatchObject({
      outcome: 'refuse',
      reason: 'The action card is too long to review.',
    })
  })
})
