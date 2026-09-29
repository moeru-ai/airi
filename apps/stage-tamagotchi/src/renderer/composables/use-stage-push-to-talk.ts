import { usePushToTalk } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { createManualRecordingChannel, manualRecordingHeartbeatMs, manualRecordingStateChanged } from '../../shared/manual-recording'
import { useDesktopPushToTalk } from './use-desktop-push-to-talk'

/** Connects the global hold shortcut to isolated manual capture and the shared stage recording lease. */
export function useStagePushToTalk() {
  const sessions = useChatSessionStore()
  const recording = ref(false)
  const channel = createManualRecordingChannel()
  const sourceId = crypto.randomUUID()
  const { t } = useI18n()
  let heartbeat: ReturnType<typeof setInterval> | undefined
  function publish(active: boolean) {
    return channel.context.emit(manualRecordingStateChanged, { sourceId, active })
      .catch(error => console.warn('[Push to Talk] Failed to publish recording state:', error))
  }
  const input = usePushToTalk({
    sessionId: () => sessions.activeSessionId,
    onError: message => toast.error(t('stage.voice.failed'), { description: message }),
    onRecordingChange: active => recording.value = active,
  })
  watch(recording, (active) => {
    clearInterval(heartbeat)
    void publish(active)
    if (active)
      heartbeat = setInterval(() => { void publish(true) }, manualRecordingHeartbeatMs)
  }, { flush: 'sync' })
  useDesktopPushToTalk({
    enabled: input.enabled,
    begin: async (isHeld) => {
      if (!input.configured.value) {
        toast.error(t('stage.voice.configure-title'), { description: t('stage.voice.configure-description') })
        return
      }
      await sessions.ensureCurrentSession()
      if (isHeld())
        await input.begin()
      if (!isHeld())
        await input.cancel()
    },
    end: input.end,
  })
  onScopeDispose(() => {
    clearInterval(heartbeat)
    void publish(false).finally(() => channel.dispose())
  })
}
