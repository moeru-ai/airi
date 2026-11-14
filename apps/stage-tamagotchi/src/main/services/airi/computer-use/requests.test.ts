import type { ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import { EventEmitter } from 'node:events'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { describe, expect, it, vi } from 'vitest'

import { chatRequestCancel, chatRequestRegister } from '../../../../shared/eventa/terminal-approval'
import { createWindowIpc } from '../../../libs/electron/testing/window-ipc'
import { requireMainFrameSender } from '../../../libs/electron/window-context'
import { PendingActionManager } from './action-manager'
import { setupChatRequests } from './requests'

vi.mock('electron', () => ({}))

describe('main Chat request IPC', () => {
  it('admits only the designated Runtime and binds its independently observed source', async () => {
    const ipc = new EventEmitter()
    const main = createContext(ipc as never)
    const runtime = createWindowIpc(ipc)
    const other = createWindowIpc(ipc)
    const actions = new PendingActionManager()
    setupChatRequests(main.context, actions, sender => sender === runtime.window.webContents)
    const input = { sessionId: 'session-a', turnId: 'turn-a', text: 'Isolated fixture task' }
    const refused = await defineInvoke(other.context, chatRequestRegister)(input)
    expect(refused).toEqual({})
    const admitted = await defineInvoke(runtime.context, chatRequestRegister)(input)
    expect(admitted.requestId).toBeTypeOf('string')
    const origin = { ...input, senderWebContentsId: runtime.window.webContents.id }
    expect(actions.validateRequest(admitted.requestId!, origin).text).toBe(input.text)
    await expect(defineInvoke(other.context, chatRequestCancel)({ requestId: admitted.requestId! })).rejects.toThrow(/source/)
    runtime.window.webContents.emit('destroyed')
    expect(() => actions.validateRequest(admitted.requestId!, origin)).toThrow(/cancelled/)
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
