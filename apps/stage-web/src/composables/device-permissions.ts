import type { DevicePermission, DevicePermissionStatus, ScreenPreview } from '@proj-airi/stage-ui/stores/device-permissions'

import { errorMessageFrom } from '@moeru/std'
import { usePushToTalkTrigger } from '@proj-airi/stage-ui/composables/push-to-talk-trigger'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'

/** The width of a screen preview. The preview panel is about 420 px wide, so twice that is sharp on a dense display. */
const PREVIEW_WIDTH = 960

/**
 * Returns the permissions that the web can set up in the onboarding.
 *
 * - Microphone: the permission of the site. A denial changes only in the site settings of the browser, and a page
 *   cannot open them. So the page tells the user where to allow it, and the request asks again.
 * - Push to Talk: the Space key, while the tab is in front. It needs no permission. Only a device with a fine pointer
 *   and a keyboard has the key, see `pushToTalkTriggerKey` in `main.ts`.
 * - Screen sharing: the browser asks which screen or window to share each time, so no permission lasts. The share
 *   runs until the permissions step closes, so the page can show it, and the summary counts it as set up.
 *
 * Call it in the setup of `App.vue`, so the Push to Talk injection resolves.
 */
export function useDevicePermissions(): DevicePermission[] {
  const audioDevice = useSettingsAudioDevice()
  const pushToTalk = usePushToTalkTrigger()

  async function microphoneStatus(): Promise<DevicePermissionStatus> {
    const permission = await navigator.permissions?.query({ name: 'microphone' as PermissionName }).catch(() => undefined)
    if (!permission)
      return audioDevice.permissionGranted ? 'granted' : 'not-determined'
    if (permission.state === 'granted')
      return 'granted'
    return permission.state === 'denied' ? 'denied' : 'not-determined'
  }

  let share: MediaStream | undefined
  let video: HTMLVideoElement | undefined

  function stopShare() {
    share?.getTracks().forEach(track => track.stop())
    share = undefined
    video = undefined
  }

  async function startShare() {
    stopShare()
    try {
      share = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    }
    catch (error) {
      // The user closed the picker, or the browser blocked it. The page offers the button again.
      console.warn('[permissions] The screen share did not start:', errorMessageFrom(error))
      return
    }
    // The user can stop the share from the sharing bar of the browser.
    share.getVideoTracks()[0]?.addEventListener('ended', stopShare)
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = share
    await video.play()
  }

  async function captureShare(): Promise<ScreenPreview[]> {
    const track = share?.getVideoTracks()[0]
    if (!video || !track || track.readyState !== 'live' || !video.videoWidth)
      return []
    const canvas = document.createElement('canvas')
    canvas.width = PREVIEW_WIDTH
    canvas.height = Math.round(PREVIEW_WIDTH * video.videoHeight / video.videoWidth)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    return [{ id: track.id, name: track.label, imageUrl: canvas.toDataURL('image/jpeg', 0.8) }]
  }

  const permissions: DevicePermission[] = [
    {
      id: 'microphone',
      kind: 'microphone',
      titleKey: 'settings.dialogs.onboarding.permissions.microphoneTitle',
      descriptionKey: 'settings.dialogs.onboarding.permissions.microphoneDescription',
      deniedHintKey: 'settings.pages.modules.hearing.sections.section.input-device.blocked-description',
      check: microphoneStatus,
      request: async () => {
        await audioDevice.askPermission()
      },
    },
  ]

  if (pushToTalk.available.value) {
    permissions.push({
      id: 'push-to-talk',
      kind: 'push-to-talk',
      titleKey: 'settings.dialogs.onboarding.permissions.pushToTalkTitle',
      descriptionKey: 'settings.dialogs.onboarding.permissions.pushToTalkDescription',
      // `useVoiceHoldKey` holds Space on the stage page.
      shortcutKeys: () => ['Space'],
      check: async () => 'granted',
      request: async () => {},
    })
  }

  if (typeof navigator.mediaDevices?.getDisplayMedia === 'function') {
    permissions.push({
      id: 'screen-share',
      kind: 'screen-recording',
      titleKey: 'settings.dialogs.onboarding.permissions.screenShareTitle',
      descriptionKey: 'settings.dialogs.onboarding.permissions.screenShareDescription',
      requestLabelKey: 'settings.dialogs.onboarding.permissions.flow.screen-recording.share',
      check: async () => share?.getVideoTracks()[0]?.readyState === 'live' ? 'granted' : 'not-determined',
      request: startShare,
      captureScreens: captureShare,
      release: stopShare,
    })
  }

  return permissions
}
