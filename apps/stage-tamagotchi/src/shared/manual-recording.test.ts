import { describe, expect, it, vi } from 'vitest'

import { createManualRecordingChannel, manualRecordingLeaseMs, ManualRecordingLeaseTracker, manualRecordingStateChanged } from './manual-recording'

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

  it('expires a recording source when its renderer stops renewing the lease', () => {
    const leases = new ManualRecordingLeaseTracker()
    leases.apply({ sourceId: 'chat-1', active: true }, 1000)
    leases.expire(1000 + manualRecordingLeaseMs - 1)
    expect(leases.active).toBe(true)

    leases.expire(1000 + manualRecordingLeaseMs)
    expect(leases.active).toBe(false)
  })

  it('keeps Hearing paused while another chat renderer holds a live lease', () => {
    const leases = new ManualRecordingLeaseTracker()
    leases.apply({ sourceId: 'chat-1', active: true }, 1000)
    leases.apply({ sourceId: 'chat-2', active: true }, 2000)
    leases.apply({ sourceId: 'chat-1', active: false }, 2500)
    expect(leases.active).toBe(true)

    leases.apply({ sourceId: 'chat-2', active: true }, 4000)
    leases.expire(1000 + manualRecordingLeaseMs)
    expect(leases.active).toBe(true)
    leases.expire(4000 + manualRecordingLeaseMs)
    expect(leases.active).toBe(false)
  })
})
