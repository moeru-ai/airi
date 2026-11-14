import type { ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import { EventEmitter } from 'node:events'
import { platform } from 'node:process'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { describe, expect, it, vi } from 'vitest'

import { chatRequestCancel, chatRequestFinish, chatRequestRegister, terminalTurboConfirm } from '../../../../shared/eventa/terminal-approval'
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
  setupChatRequests(main.context, actions, {
    getRuntime: () => runtime.window.webContents,
    isChatWindow: window => window === chat.window,
    i18n: createI18n({ locale: 'en', messages: { en: {} } }),
  })
  const input = { sessionId: 'session-a', turnId: 'turn-a', text: 'Read the local time.' }
  const register = defineInvoke(runtime.context, chatRequestRegister)
  const confirm = defineInvoke(chat.context, terminalTurboConfirm)
  const attribution = { ...input, senderWebContentsId: runtime.window.webContents.id }
  return { main, runtime, chat, other, actions, input, attribution, register, confirm }
}

describe('main Chat request IPC', () => {
  it('admits only the designated Runtime and binds its independently observed source', async () => {
    const { main, runtime, other, actions, input, register, attribution } = fixture()
    const refused = await defineInvoke(other.context, chatRequestRegister)(input)
    expect(refused).toEqual({})
    const admitted = await register(input)
    expect(admitted.requestId).toBeTypeOf('string')
    expect(actions.validateRequest(admitted.requestId!, attribution)).toMatchObject({ text: input.text, terminalTurbo: false })
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

  it.runIf(platform === 'win32')('binds native Turbo confirmation to the exact chat submission', async () => {
    const { main, runtime, chat, other, actions, input, attribution, register, confirm } = fixture()
    await expect(defineInvoke(other.context, terminalTurboConfirm)(input)).resolves.toBe(false)
    expect(electron.showMessageBox).not.toHaveBeenCalled()
    electron.showMessageBox.mockResolvedValueOnce({ response: 0 })
    await expect(confirm(input)).resolves.toBe(false)
    const manual = await register(input)
    expect(actions.validateRequest(manual.requestId!, attribution).terminalTurbo).toBe(false)
    electron.showMessageBox.mockResolvedValueOnce({ response: 1 })
    await expect(confirm(input)).resolves.toBe(true)
    expect(electron.showMessageBox).toHaveBeenLastCalledWith(chat.window, expect.objectContaining({ defaultId: 0, cancelId: 0 }))
    for (const changed of [{ ...input, sessionId: 'session-b' }, { ...input, turnId: 'turn-b' }, { ...input, text: 'Different text' }]) {
      const { requestId } = await register(changed)
      expect(actions.validateRequest(requestId!, { ...changed, senderWebContentsId: attribution.senderWebContentsId }).terminalTurbo).toBe(false)
    }
    const confirmed = await register(input)
    expect(actions.validateRequest(confirmed.requestId!, attribution).terminalTurbo).toBe(true)
    await defineInvoke(runtime.context, chatRequestFinish)({ requestId: confirmed.requestId! })
    const repeated = await register(input)
    expect(actions.validateRequest(repeated.requestId!, attribution).terminalTurbo).toBe(false)
    await main.dispose()
  })

  it.runIf(platform === 'win32')('drops Turbo when the runtime navigates while the native dialog is open', async () => {
    const { main, runtime, actions, input, attribution, register, confirm } = fixture()
    const decision = Promise.withResolvers<{ response: number }>()
    electron.showMessageBox.mockReturnValueOnce(decision.promise)
    const confirmed = confirm(input)
    await vi.waitFor(() => expect(electron.showMessageBox).toHaveBeenCalledOnce())
    runtime.window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    decision.resolve({ response: 1 })
    await expect(confirmed).resolves.toBe(false)
    const { requestId } = await register(input)
    expect(actions.validateRequest(requestId!, attribution).terminalTurbo).toBe(false)
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
