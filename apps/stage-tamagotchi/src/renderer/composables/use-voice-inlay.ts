import type { VoiceInlayActivity } from '../../shared/eventa'

import { createContext } from '@moeru/eventa/adapters/broadcast-channel'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useHearingDraftStore } from '@proj-airi/stage-ui/stores/hearing-drafts'
import { onScopeDispose, shallowRef, watch } from 'vue'

import { electronVoiceInlayHide, electronVoiceInlayShow, voiceInlayActivityChanged, voiceInlayActivityRequested, voiceInlayChannelName } from '../../shared/eventa'

/** Receives transient recording state. A new utility window requests the current snapshot. */
export function useVoiceInlayActivity() {
  const activity = shallowRef<VoiceInlayActivity | null>(null)
  const channel = createContext(new BroadcastChannel(voiceInlayChannelName), { closeOnDispose: true })
  const stop = channel.context.on(voiceInlayActivityChanged, ({ body }) => {
    activity.value = body ?? null
  })
  void channel.context.emit(voiceInlayActivityRequested, undefined)
  onScopeDispose(() => {
    stop()
    channel.dispose()
  })
  return activity
}

/** Owns window presentation in the main renderer. Draft content remains leader-owned in hearing-drafts. */
export function useVoiceInlay() {
  const drafts = useHearingDraftStore()
  const activity = shallowRef<VoiceInlayActivity | null>(null)
  const channel = createContext(new BroadcastChannel(voiceInlayChannelName), { closeOnDispose: true })
  const show = useElectronEventaInvoke(electronVoiceInlayShow)
  const hide = useElectronEventaInvoke(electronVoiceInlayHide)
  let disposed = false
  let presentationQueue = Promise.resolve()
  let presented: string | undefined
  const publish = () => channel.context.emit(voiceInlayActivityChanged, activity.value).catch(console.error)
  const stopRequest = channel.context.on(voiceInlayActivityRequested, publish)

  // Serialize window operations. Each queued operation reads current state after the prior invoke ends.
  function present() {
    presentationQueue = presentationQueue.then(async () => {
      if (disposed)
        return
      const draftSessionId = drafts.pendingSessionIds.at(-1)
      const target = activity.value
        ? `listening:${activity.value.segmentId}`
        : draftSessionId ? `draft:${draftSessionId}` : 'hidden'
      // Replicated draft edits can replace the pending array without changing its owner.
      if (target === presented)
        return
      if (activity.value)
        await show({ focus: false, presentation: 'listening' })
      else if (draftSessionId)
        await show({ focus: true, presentation: 'draft' })
      else
        await hide()
      presented = target
    }).catch(console.error)
    return presentationQueue
  }

  function onRecordingChange(event: { active: boolean, sessionId: string, segmentId: string }) {
    if (disposed)
      return
    if (event.active)
      activity.value = { sessionId: event.sessionId, segmentId: event.segmentId, phase: 'recording', text: '' }
    else if (activity.value?.segmentId === event.segmentId)
      activity.value = { ...activity.value, phase: 'transcribing' }
    publish()
    void present()
  }

  function onTranscriptionProgress(event: { sessionId: string, segmentId: string, text: string }) {
    if (disposed || activity.value?.segmentId !== event.segmentId)
      return
    activity.value = { ...activity.value, phase: 'transcribing', text: event.text }
    publish()
  }

  function onTranscriptionComplete(event: { sessionId: string, segmentId: string, text: string }) {
    if (disposed || activity.value?.segmentId !== event.segmentId)
      return
    activity.value = null
    publish()
    void present()
  }

  watch(() => drafts.pendingSessionIds, () => {
    void present()
  })
  onScopeDispose(() => {
    activity.value = null
    publish()
    disposed = true
    stopRequest()
    channel.dispose()
    void presentationQueue.then(() => hide()).catch(console.error)
  })
  return { onRecordingChange, onTranscriptionProgress, onTranscriptionComplete }
}
