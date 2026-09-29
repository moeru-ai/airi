import { describe, expect, it, vi } from 'vitest'

import { createManualRecordingChannel, manualRecordingStateChanged } from './manual-recording'

describe('manual recording channel', () => {
  it('delivers recording state between Electron renderer contexts', async () => {
    const chatWindow = createManualRecordingChannel()
    const mainWindow = createManualRecordingChannel()
    const events: Array<{ sourceId: string, active: boolean }> = []
    const stop = mainWindow.context.on(manualRecordingStateChanged, ({ body }) => {
      if (body)
        events.push(body)
    })

    try {
      await chatWindow.context.emit(manualRecordingStateChanged, { sourceId: 'chat-1', active: true })
      await vi.waitFor(() => expect(events).toEqual([{ sourceId: 'chat-1', active: true }]))
      await chatWindow.context.emit(manualRecordingStateChanged, { sourceId: 'chat-1', active: false })
      await vi.waitFor(() => expect(events).toEqual([
        { sourceId: 'chat-1', active: true },
        { sourceId: 'chat-1', active: false },
      ]))
    }
    finally {
      stop()
      chatWindow.dispose()
      mainWindow.dispose()
    }
  })
})
