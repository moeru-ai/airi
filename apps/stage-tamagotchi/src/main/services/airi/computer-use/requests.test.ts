import type { ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import { EventEmitter } from 'node:events'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { describe, expect, it, vi } from 'vitest'

import { chatRequestCancel, chatRequestFinish, chatRequestRegister, terminalTurboMode } from '../../../../shared/eventa/terminal-approval'
import { createWindowIpc } from '../../../libs/electron/testing/window-ipc'
import { requireMainFrameSender } from '../../../libs/electron/window-context'
import { createI18n } from '../../../libs/i18n'
import { PendingActionManager } from './action-manager'
import { setupChatRequests } from './requests'

const electron = vi.hoisted(() => ({ fromWebContents: vi.fn(), showMessageBox: vi.fn() }))
vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: electron.fromWebContents },
  dialog: { showMessageBox: electron.showMessageBox },
}))

function fixture() {
  const ipc = new EventEmitter()
  const main = createContext(ipc as never)
  const runtime = createWindowIpc(ipc)
  const chat = createWindowIpc(ipc)
  const other = createWindowIpc(ipc)
  electron.showMessageBox.mockReset()
  electron.fromWebContents.mockImplementation(sender => [runtime, chat, other].find(window => window.window.webContents === sender)?.window)
  const actions = new PendingActionManager()
  const chatRequests = setupChatRequests(main.context, actions, {
    getRuntime: () => runtime.window.webContents,
    isChatWindow: window => window === chat.window || window === runtime.window,
    i18n: createI18n({ locale: 'en', messages: { en: {} } }),
  })
  const input = { sessionId: 'session-a', turnId: 'turn-a', text: 'Read the local time.' }
  const register = defineInvoke(runtime.context, chatRequestRegister)
  const turboMode = defineInvoke(chat.context, terminalTurboMode)
  const attribution = { ...input, senderWebContentsId: runtime.window.webContents.id }
  return { main, runtime, chat, other, actions, input, attribution, register, turboMode, presentComputerUse: chatRequests.presentComputerUse }
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
    const { main, register, input } = fixture()
    const forged = { ...input, terminalTurbo: true }
    await expect(register(forged)).rejects.toThrow()
    expect(electron.showMessageBox).not.toHaveBeenCalled()
    await main.dispose()
  })

  it('confines native Turbo confirmation to its conversation across multiple turns', async () => {
    const { main, runtime, chat, other, actions, input, attribution, register, turboMode } = fixture()
    const { sessionId } = input
    await expect(defineInvoke(other.context, terminalTurboMode)({ sessionId, enabled: true })).resolves.toBe(false)
    await expect(turboMode({ sessionId })).resolves.toBe(false)
    expect(electron.showMessageBox).not.toHaveBeenCalled()
    electron.showMessageBox.mockResolvedValueOnce({ response: 0 })
    await expect(turboMode({ sessionId, enabled: true })).resolves.toBe(false)
    expect(actions.terminalTurboSignal(sessionId, attribution.senderWebContentsId)).toBeUndefined()
    electron.showMessageBox.mockResolvedValueOnce({ response: 1 })
    await expect(turboMode({ sessionId, enabled: true })).resolves.toBe(true)
    expect(electron.showMessageBox).toHaveBeenLastCalledWith(chat.window, expect.objectContaining({ defaultId: 0, cancelId: 0 }))
    const signal = actions.terminalTurboSignal(sessionId, attribution.senderWebContentsId)
    expect(signal?.aborted).toBe(false)
    expect(actions.terminalTurboSignal(sessionId, other.window.webContents.id)).toBeUndefined()
    await expect(turboMode({ sessionId: 'session-b' })).resolves.toBe(false)
    const first = await register(input)
    await defineInvoke(runtime.context, chatRequestFinish)({ requestId: first.requestId! })
    const next = await register({ ...input, turnId: 'turn-b' })
    expect(next.requestId).not.toBe(first.requestId)
    expect(actions.terminalTurboSignal(sessionId, attribution.senderWebContentsId)).toBe(signal)
    await expect(turboMode({ sessionId, enabled: false })).resolves.toBe(false)
    expect(signal?.aborted).toBe(true)
    expect(actions.terminalTurboSignal(sessionId, attribution.senderWebContentsId)).toBeUndefined()
    await main.dispose()
  })

  it('uses the same native dialog for a Computer Use change when Turbo is off', async () => {
    const { main, input, attribution, register, presentComputerUse } = fixture()
    const request = await register(input)
    electron.showMessageBox.mockResolvedValueOnce({ response: 1 })

    await expect(presentComputerUse({
      actionId: 'pending-computer',
      requestId: request.requestId!,
      attribution: { ...attribution, toolCallId: 'computer-call' },
      serverName: 'airi-terminal',
      toolName: 'desktop_click',
      summary: 'Click the requested point.',
    })).resolves.toBe(true)
    expect(electron.showMessageBox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      defaultId: 0,
      cancelId: 0,
      buttons: expect.arrayContaining(['tamagotchi.stage.chat-window.computer-tools.computer-use-allow']),
    }))
    await main.dispose()
  })

  it.each(['navigate', 'turn Turbo off'] as const)('discards a late Turbo confirmation when the user chooses to %s', async (action) => {
    const { main, runtime, actions, input, attribution, turboMode } = fixture()
    const decision = Promise.withResolvers<{ response: number }>()
    electron.showMessageBox.mockReturnValueOnce(decision.promise)
    const confirmed = turboMode({ sessionId: input.sessionId, enabled: true })
    await vi.waitFor(() => expect(electron.showMessageBox).toHaveBeenCalledOnce())
    if (action === 'navigate')
      runtime.window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    else
      await expect(turboMode({ sessionId: input.sessionId, enabled: false })).resolves.toBe(false)
    decision.resolve({ response: 1 })
    await expect(confirmed).resolves.toBe(false)
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
