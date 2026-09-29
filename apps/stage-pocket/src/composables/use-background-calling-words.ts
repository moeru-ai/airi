import type { MaybeRefOrGetter } from 'vue'

import type { BackgroundWakeKeyword } from '../modules/background-wake-word'

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { onScopeDispose, toValue, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { BackgroundWakeWord } from '../modules/background-wake-word'

interface BackgroundCallingWordsOptions {
  active: MaybeRefOrGetter<boolean>
  enabled: MaybeRefOrGetter<boolean>
  keywords: MaybeRefOrGetter<BackgroundWakeKeyword[]>
  onWake: (cardId: string) => Promise<boolean>
  onError: (error: unknown) => void
}

// Route instances share the one native service and serialize its lifecycle commands.
let nativeTransition = Promise.resolve()
let currentOwner: symbol | undefined

/** Connects Android notifications to the foreground hearing owner. */
export function useBackgroundCallingWords(options: BackgroundCallingWordsOptions) {
  const { t, locale } = useI18n()
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android')
    return

  let disposed = false
  const owner = Symbol('pocket-background-calling-words')
  currentOwner = owner

  function isCurrent() {
    return !disposed && currentOwner === owner
  }

  async function synchronize() {
    if (!isCurrent())
      return
    if (!toValue(options.enabled) || toValue(options.keywords).length === 0) {
      await BackgroundWakeWord.stop()
      return
    }
    // Android permits microphone service startup only while the activity is visible.
    if (!toValue(options.active))
      return

    const pending = await BackgroundWakeWord.peekPendingWake()
    if (!isCurrent() || !toValue(options.active) || !toValue(options.enabled))
      return
    if (pending.id && pending.characterId) {
      // Opening Pocket without tapping the match dismisses it without starting capture.
      // A tapped match stays pending when the foreground owner cannot arm yet.
      const consumed = !pending.tapped || await options.onWake(pending.characterId)
      if (consumed)
        await BackgroundWakeWord.acknowledgeWake({ id: pending.id, consumed: pending.tapped === true })
    }

    const permission = await LocalNotifications.checkPermissions()
    const display = permission.display === 'prompt'
      ? (await LocalNotifications.requestPermissions()).display
      : permission.display
    if (!isCurrent() || !toValue(options.active) || !toValue(options.enabled))
      return
    if (display !== 'granted')
      throw new Error('Notification permission is required for Android background wake words')

    const keywords = toValue(options.keywords)
    if (keywords.length === 0) {
      await BackgroundWakeWord.stop()
      return
    }
    await BackgroundWakeWord.start({
      keywords,
      notificationText: {
        listeningChannel: t('stage.background-calling.listening-channel'),
        matchChannel: t('stage.background-calling.match-channel'),
        listeningTitle: t('stage.background-calling.listening-title'),
        listeningBody: t('stage.background-calling.listening-body'),
        matchTitle: t('stage.background-calling.match-title'),
        matchBody: t('stage.background-calling.match-body'),
        errorTitle: t('stage.background-calling.error-title'),
        errorBody: t('stage.background-calling.error-body'),
      },
    })
  }

  function queueSynchronization() {
    nativeTransition = nativeTransition.then(synchronize).catch(options.onError)
  }

  const listener = BackgroundWakeWord.addListener('wakeNotificationTapped', queueSynchronization)
  void listener.catch(options.onError)
  watch([
    () => toValue(options.active),
    () => toValue(options.enabled),
    () => toValue(options.keywords),
    locale,
  ], queueSynchronization, { immediate: true })

  onScopeDispose(() => {
    disposed = true
    void listener.then(handle => handle.remove()).catch(options.onError)
    if (currentOwner === owner) {
      currentOwner = undefined
      nativeTransition = nativeTransition.then(async () => {
        if (!currentOwner)
          await BackgroundWakeWord.stop()
      }).catch(options.onError)
    }
  })
}
