import type { HearingInputChannelEvent } from '@proj-airi/stage-shared'

import { hearingInputChannelName } from '@proj-airi/stage-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, shallowRef } from 'vue'

import { useHearingInputChannel } from './use-hearing-input-channel'

const broadcastChannelMock = vi.hoisted(() => ({
  useBroadcastChannel: vi.fn(),
}))

vi.mock('@vueuse/core', () => ({
  useBroadcastChannel: broadcastChannelMock.useBroadcastChannel,
}))

describe('useHearingInputChannel', () => {
  let data: ReturnType<typeof shallowRef<HearingInputChannelEvent | undefined>>

  beforeEach(() => {
    data = shallowRef<HearingInputChannelEvent>()
    broadcastChannelMock.useBroadcastChannel.mockReset()
    broadcastChannelMock.useBroadcastChannel.mockReturnValue({ data })
  })

  it('listens on the shared Hearing input channel', () => {
    useHearingInputChannel(ref(''))

    expect(broadcastChannelMock.useBroadcastChannel).toHaveBeenCalledWith({
      name: hearingInputChannelName,
    })
  })

  it('replaces Provider revisions and clears only the owned suffix', async () => {
    const input = ref('manual note')
    useHearingInputChannel(input)

    data.value = { operation: 'replace', sourceId: 'utterance-1', text: 'hello' }
    await nextTick()
    expect(input.value).toBe('manual note hello')

    data.value = { operation: 'replace', sourceId: 'utterance-1', text: 'hello world' }
    await nextTick()
    expect(input.value).toBe('manual note hello world')

    data.value = { operation: 'clear', sourceId: 'utterance-1' }
    await nextTick()
    expect(input.value).toBe('manual note')
  })

  it('ignores stale cleanup after a new Provider utterance starts', async () => {
    const input = ref('')
    useHearingInputChannel(input)

    data.value = { operation: 'replace', sourceId: 'utterance-1', text: 'first' }
    await nextTick()
    data.value = { operation: 'replace', sourceId: 'utterance-2', text: 'second' }
    await nextTick()
    expect(input.value).toBe('second')

    data.value = { operation: 'clear', sourceId: 'utterance-1' }
    await nextTick()
    expect(input.value).toBe('second')

    data.value = { operation: 'clear', sourceId: 'utterance-2' }
    await nextTick()
    expect(input.value).toBe('')
  })

  it('does not replace text after the user edits the Provider-owned suffix', async () => {
    const input = ref('')
    useHearingInputChannel(input)

    data.value = { operation: 'replace', sourceId: 'utterance-1', text: 'draft' }
    await nextTick()
    input.value = 'user edit'

    data.value = { operation: 'replace', sourceId: 'utterance-1', text: 'provider revision' }
    await nextTick()
    expect(input.value).toBe('user edit')
  })
})
