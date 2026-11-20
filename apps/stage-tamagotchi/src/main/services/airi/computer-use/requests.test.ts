import type { ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import type { ApprovalPrompt } from '../../../../shared/eventa/terminal-approval'

import { EventEmitter } from 'node:events'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { describe, expect, it, vi } from 'vitest'

import { chatRequestCancel, chatRequestFinish, chatRequestRegister, sessionApprovalGrant } from '../../../../shared/eventa/terminal-approval'
import { createWindowIpc } from '../../../libs/electron/testing/window-ipc'
import { requireMainFrameSender } from '../../../libs/electron/window-context'
import { createI18n } from '../../../libs/i18n'
import { PendingActionManager } from './action-manager'
import { setupChatRequests } from './requests'

const electron = vi.hoisted(() => ({ fromWebContents: vi.fn() }))
vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: electron.fromWebContents },
}))

function fixture() {
  const ipc = new EventEmitter()
  const main = createContext(ipc as never)
  const runtime = createWindowIpc(ipc)
  const chat = createWindowIpc(ipc)
  const other = createWindowIpc(ipc)
  electron.fromWebContents.mockImplementation(sender => [runtime, chat, other].find(window => window.window.webContents === sender)?.window)
  const presentConfirmation = vi.fn<(request: ApprovalPrompt, signal?: AbortSignal) => Promise<boolean>>().mockResolvedValue(false)
  const actions = new PendingActionManager()
  const chatRequests = setupChatRequests(main.context, actions, {
    getRuntime: () => runtime.window.webContents,
    isChatWindow: window => window === chat.window,
    i18n: createI18n({ locale: 'en', messages: { en: {} } }),
    presentConfirmation,
  })
  const input = { sessionId: 'session-a', turnId: 'turn-a', text: 'Read the local time.' }
  const register = defineInvoke(runtime.context, chatRequestRegister)
  const sessionGrant = defineInvoke(chat.context, sessionApprovalGrant)
  const attribution = { ...input, senderWebContentsId: runtime.window.webContents.id }
  return { main, runtime, chat, other, actions, input, attribution, register, sessionGrant, presentConfirmation, presentComputerUse: chatRequests.presentComputerUse }
}

describe('main Chat request IPC', () => {
  it('admits only the designated Runtime and binds its independently observed source', async () => {
    const { main, runtime, other, actions, input, register, attribution } = fixture()
    const refused = await defineInvoke(other.context, chatRequestRegister)(input)
    expect(refused).toEqual({})
    const admitted = await register(input)
    expect(admitted.requestId).toBeTypeOf('string')
    expect(actions.validateRequest(admitted.requestId!, attribution).text).toBe(input.text)
    await expect(defineInvoke(other.context, chatRequestCancel)({ requestId: admitted.requestId! })).rejects.toThrow(/source/)
    runtime.window.webContents.emit('destroyed')
    expect(() => actions.validateRequest(admitted.requestId!, attribution)).toThrow(/cancelled/)
    await main.dispose()
  })

  it('does not accept a Turbo field in Runtime request data', async () => {
    const { main, register, input, presentConfirmation } = fixture()
    const forged = { ...input, terminalTurbo: true }
    await expect(register(forged)).rejects.toThrow()
    expect(presentConfirmation).not.toHaveBeenCalled()
    await main.dispose()
  })

  it('confines AIRI Turbo confirmation to its conversation across multiple turns', async () => {
    const { main, runtime, other, actions, input, attribution, register, sessionGrant, presentConfirmation } = fixture()
    const { sessionId } = input
    await expect(defineInvoke(other.context, sessionApprovalGrant)({ sessionId, lane: 'terminal', mode: 'full' })).resolves.toBe(false)
    await expect(sessionGrant({ sessionId, lane: 'terminal' })).resolves.toBe('ask')
    expect(presentConfirmation).not.toHaveBeenCalled()
    presentConfirmation.mockResolvedValueOnce(false)
    await expect(sessionGrant({ sessionId, lane: 'terminal', mode: 'full' })).resolves.toBe('ask')
    expect(actions.terminalTurboSignal(sessionId, attribution.senderWebContentsId)).toBeUndefined()
    presentConfirmation.mockResolvedValueOnce(true)
    await expect(sessionGrant({ sessionId, lane: 'terminal', mode: 'full' })).resolves.toBe('full')
    expect(presentConfirmation).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId }), expect.any(AbortSignal))
    const signal = actions.terminalTurboSignal(sessionId, attribution.senderWebContentsId)
    expect(signal?.aborted).toBe(false)
    expect(actions.terminalTurboSignal(sessionId, other.window.webContents.id)).toBeUndefined()
    await expect(sessionGrant({ sessionId: 'session-b', lane: 'terminal' })).resolves.toBe('ask')
    const first = await register(input)
    await defineInvoke(runtime.context, chatRequestFinish)({ requestId: first.requestId! })
    const next = await register({ ...input, turnId: 'turn-b' })
    expect(next.requestId).not.toBe(first.requestId)
    expect(actions.terminalTurboSignal(sessionId, attribution.senderWebContentsId)).toBe(signal)
    await expect(sessionGrant({ sessionId, lane: 'terminal', mode: 'ask' })).resolves.toBe('ask')
    expect(signal?.aborted).toBe(true)
    expect(actions.terminalTurboSignal(sessionId, attribution.senderWebContentsId)).toBeUndefined()
    await main.dispose()
  })

  it('keeps Terminal and Computer Use Turbo grants independent', async () => {
    const { main, actions, input, attribution, sessionGrant, presentConfirmation } = fixture()
    presentConfirmation.mockResolvedValueOnce(true)
    await expect(sessionGrant({ sessionId: input.sessionId, lane: 'terminal', mode: 'full' })).resolves.toBe('full')
    expect(actions.terminalTurboSignal(input.sessionId, attribution.senderWebContentsId)?.aborted).toBe(false)
    expect(actions.computerUseTurboSignal(input.sessionId, attribution.senderWebContentsId)).toBeUndefined()
    presentConfirmation.mockResolvedValueOnce(true)
    await expect(sessionGrant({ sessionId: input.sessionId, lane: 'computer_use', mode: 'full' })).resolves.toBe('full')
    expect(actions.computerUseTurboSignal(input.sessionId, attribution.senderWebContentsId)?.aborted).toBe(false)
    await expect(sessionGrant({ sessionId: input.sessionId, lane: 'terminal', mode: 'ask' })).resolves.toBe('ask')
    expect(actions.terminalTurboSignal(input.sessionId, attribution.senderWebContentsId)).toBeUndefined()
    expect(actions.computerUseTurboSignal(input.sessionId, attribution.senderWebContentsId)?.aborted).toBe(false)
    await main.dispose()
  })

  it('keeps Ask when Command Auto cannot read a workspace', async () => {
    const { main, input, sessionGrant, presentConfirmation } = fixture()
    await expect(sessionGrant({ sessionId: input.sessionId, lane: 'terminal', mode: 'auto' })).resolves.toBe('ask')
    expect(presentConfirmation).not.toHaveBeenCalled()
    await main.dispose()
  })

  it('keeps Ask when Computer Use Auto cannot read the foreground app', async () => {
    const { main, input, sessionGrant, presentConfirmation } = fixture()
    await expect(sessionGrant({ sessionId: input.sessionId, lane: 'computer_use', mode: 'auto' })).resolves.toBe('ask')
    expect(presentConfirmation).not.toHaveBeenCalled()
    await main.dispose()
  })

  it('keeps Ask when the foreground application name is blank', async () => {
    const ipc = new EventEmitter()
    const main = createContext(ipc as never)
    const runtime = createWindowIpc(ipc)
    const chat = createWindowIpc(ipc)
    electron.fromWebContents.mockImplementation(sender => [runtime, chat].find(window => window.window.webContents === sender)?.window)
    const presentConfirmation = vi.fn<(request: ApprovalPrompt, signal?: AbortSignal) => Promise<boolean>>().mockResolvedValue(true)
    const actions = new PendingActionManager()
    setupChatRequests(main.context, actions, {
      getRuntime: () => runtime.window.webContents,
      isChatWindow: window => window === chat.window,
      i18n: createI18n({ locale: 'en', messages: { en: {} } }),
      presentConfirmation,
      readForegroundApp: async () => ({ appName: '   ', windowTitle: 'Notes' }),
    })
    const sessionGrant = defineInvoke(chat.context, sessionApprovalGrant)
    await expect(sessionGrant({ sessionId: 'session-blank-app', lane: 'computer_use', mode: 'auto' })).resolves.toBe('ask')
    expect(presentConfirmation).not.toHaveBeenCalled()
    await main.dispose()
  })

  it('confirms Computer Use Auto against the frozen application', async () => {
    const ipc = new EventEmitter()
    const main = createContext(ipc as never)
    const runtime = createWindowIpc(ipc)
    const chat = createWindowIpc(ipc)
    electron.fromWebContents.mockImplementation(sender => [runtime, chat].find(window => window.window.webContents === sender)?.window)
    const presentConfirmation = vi.fn<(request: ApprovalPrompt, signal?: AbortSignal) => Promise<boolean>>().mockResolvedValue(true)
    const actions = new PendingActionManager()
    setupChatRequests(main.context, actions, {
      getRuntime: () => runtime.window.webContents,
      isChatWindow: window => window === chat.window,
      i18n: createI18n({ locale: 'en', messages: { en: {} } }),
      presentConfirmation,
      readForegroundApp: async () => ({ appName: 'Notes', windowTitle: 'Notes' }),
    })
    const sessionGrant = defineInvoke(chat.context, sessionApprovalGrant)
    const sessionId = 'session-computer-auto'
    await expect(sessionGrant({ sessionId, lane: 'computer_use', mode: 'auto' })).resolves.toBe('auto')
    expect(presentConfirmation).toHaveBeenCalledWith(expect.objectContaining({ sessionId }), expect.any(AbortSignal))
    expect(actions.autoGrant('computer_use', sessionId, runtime.window.webContents.id)?.frozenAppName).toBe('Notes')
    await main.dispose()
  })

  it('confirms Command Auto against the frozen workspace and returns to Ask when it expires', async () => {
    const startedAt = 1_700_000_000_000
    const now = vi.spyOn(Date, 'now').mockReturnValue(startedAt)
    const ipc = new EventEmitter()
    const main = createContext(ipc as never)
    const runtime = createWindowIpc(ipc)
    const chat = createWindowIpc(ipc)
    electron.fromWebContents.mockImplementation(sender => [runtime, chat].find(window => window.window.webContents === sender)?.window)
    const presentConfirmation = vi.fn<(request: ApprovalPrompt, signal?: AbortSignal) => Promise<boolean>>().mockResolvedValue(true)
    const actions = new PendingActionManager({ autoGrantTtlMs: 30_000 })
    setupChatRequests(main.context, actions, {
      getRuntime: () => runtime.window.webContents,
      isChatWindow: window => window === chat.window,
      i18n: createI18n({ locale: 'en', messages: { en: {} } }),
      presentConfirmation,
      readCommandWorkspace: async () => '/workspace/app',
    })
    const sessionGrant = defineInvoke(chat.context, sessionApprovalGrant)
    const sessionId = 'session-auto'
    await expect(sessionGrant({ sessionId, lane: 'terminal', mode: 'auto' })).resolves.toBe('auto')
    expect(presentConfirmation).toHaveBeenCalledWith(expect.objectContaining({ sessionId }), expect.any(AbortSignal))
    expect(actions.autoGrant('terminal', sessionId, runtime.window.webContents.id)?.workspaceRoot).toBe('/workspace/app')
    expect(actions.grantMode('terminal', sessionId, runtime.window.webContents.id)).toBe('auto')
    expect(actions.terminalTurboSignal(sessionId, runtime.window.webContents.id)).toBeUndefined()
    const signal = actions.autoGrant('terminal', sessionId, runtime.window.webContents.id)?.signal
    vi.spyOn(Date, 'now').mockReturnValue(startedAt + 30_000)
    await expect(sessionGrant({ sessionId, lane: 'terminal' })).resolves.toBe('ask')
    expect(signal?.aborted).toBe(true)
    await main.dispose()
    now.mockRestore()
  })

  it('uses the same AIRI approval window for a Computer Use change when Turbo is off', async () => {
    const { main, input, attribution, register, presentConfirmation, presentComputerUse } = fixture()
    const request = await register(input)
    presentConfirmation.mockResolvedValueOnce(true)

    await expect(presentComputerUse({
      actionId: 'pending-computer',
      requestId: request.requestId!,
      attribution: { ...attribution, toolCallId: 'computer-call' },
      serverName: 'airi-terminal',
      toolName: 'desktop_click',
      summary: 'Click the requested point.',
    })).resolves.toBe(true)
    expect(presentConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: input.sessionId,
      toolName: 'desktop_click',
    }), expect.any(AbortSignal))
    await main.dispose()
  })

  it.each(['navigate', 'turn Turbo off'] as const)('discards a late Turbo confirmation when the user chooses to %s', async (action) => {
    const { main, runtime, actions, input, attribution, sessionGrant, presentConfirmation } = fixture()
    const decision = Promise.withResolvers<boolean>()
    presentConfirmation.mockReturnValueOnce(decision.promise)
    const confirmed = sessionGrant({ sessionId: input.sessionId, lane: 'terminal', mode: 'full' })
    await vi.waitFor(() => expect(presentConfirmation).toHaveBeenCalledOnce())
    if (action === 'navigate')
      runtime.window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    else
      await expect(sessionGrant({ sessionId: input.sessionId, lane: 'terminal', mode: 'ask' })).resolves.toBe('ask')
    decision.resolve(true)
    await expect(confirmed).resolves.toBe('ask')
    expect(actions.terminalTurboSignal(input.sessionId, attribution.senderWebContentsId)).toBeUndefined()
    await main.dispose()
  })

  it('rejects missing, child, and destroyed frames independently of payload labels', () => {
    const frame = {}
    const sender = { id: 71, mainFrame: frame, isDestroyed: () => false }
    const options = (actual: unknown) => ({ raw: { ipcMainEvent: actual } }) as ElectronMainEmitOptions
    expect(requireMainFrameSender(options({ sender, senderFrame: frame }))).toBe(sender)
    expect(() => requireMainFrameSender()).toThrow(/main-frame/)
    expect(() => requireMainFrameSender(options({ sender, senderFrame: {} }))).toThrow(/main-frame/)
    expect(() => requireMainFrameSender(options({ sender: { ...sender, isDestroyed: () => true }, senderFrame: frame }))).toThrow(/main-frame/)
  })
})
