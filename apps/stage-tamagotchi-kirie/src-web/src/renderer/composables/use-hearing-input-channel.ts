import type { HearingInputChannelEvent } from '@proj-airi/stage-shared'
import type { Ref } from 'vue'

import { hearingInputChannelName } from '@proj-airi/stage-shared'
import { useStreamingTranscriptionInput } from '@proj-airi/stage-ui/composables/use-streaming-transcription-input'
import { useBroadcastChannel } from '@vueuse/core'
import { watch } from 'vue'

/** Applies cross-window Hearing updates to one editable chat input. */
export function useHearingInputChannel(input: Ref<string>) {
  const streamingInput = useStreamingTranscriptionInput(input)
  const { data } = useBroadcastChannel<HearingInputChannelEvent, HearingInputChannelEvent>({
    name: hearingInputChannelName,
  })
  let activeSourceId: string | undefined

  watch(data, (event) => {
    if (!event)
      return

    if (event.operation === 'replace') {
      if (!event.text.trim())
        return

      if (activeSourceId && activeSourceId !== event.sourceId)
        streamingInput.clear()

      activeSourceId = event.sourceId
      streamingInput.replace(event.text)
      return
    }

    if (event.sourceId !== activeSourceId)
      return

    streamingInput.clear()
    activeSourceId = undefined
  })
}
