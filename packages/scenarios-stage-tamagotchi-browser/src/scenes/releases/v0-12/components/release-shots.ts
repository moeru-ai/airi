import { inject } from 'vue'

import chatFloatingDanmakuLight from '../../../../../artifacts/raw/releases/v0-12/chat-floating-danmaku-light.avif'
import chatFloatingDanmaku from '../../../../../artifacts/raw/releases/v0-12/chat-floating-danmaku.avif'
import chatToolCallsLight from '../../../../../artifacts/raw/releases/v0-12/chat-tool-calls-light.avif'
import chatToolCalls from '../../../../../artifacts/raw/releases/v0-12/chat-tool-calls.avif'
import mobileChatLight from '../../../../../artifacts/raw/releases/v0-12/mobile-chat-light.avif'
import mobileChat from '../../../../../artifacts/raw/releases/v0-12/mobile-chat.avif'
import mobileMenuLight from '../../../../../artifacts/raw/releases/v0-12/mobile-menu-light.avif'
import mobileMenu from '../../../../../artifacts/raw/releases/v0-12/mobile-menu.avif'
import settingsHearingLight from '../../../../../artifacts/raw/releases/v0-12/settings-hearing-light.avif'
import settingsHearing from '../../../../../artifacts/raw/releases/v0-12/settings-hearing.avif'
import settingsLive2dImportReportLight from '../../../../../artifacts/raw/releases/v0-12/settings-live2d-import-report-light.avif'
import settingsLive2dImportReport from '../../../../../artifacts/raw/releases/v0-12/settings-live2d-import-report.avif'
import settingsLive2dMagicLight from '../../../../../artifacts/raw/releases/v0-12/settings-live2d-magic-light.avif'
import settingsLive2dMagic from '../../../../../artifacts/raw/releases/v0-12/settings-live2d-magic.avif'
import settingsStickersLight from '../../../../../artifacts/raw/releases/v0-12/settings-stickers-light.avif'
import settingsStickers from '../../../../../artifacts/raw/releases/v0-12/settings-stickers.avif'
import settingsWakeWordsLight from '../../../../../artifacts/raw/releases/v0-12/settings-wake-words-light.avif'
import settingsWakeWords from '../../../../../artifacts/raw/releases/v0-12/settings-wake-words.avif'
import stageLive2dMagic1 from '../../../../../artifacts/raw/releases/v0-12/stage-live2d-magic-1.avif'
import stageLive2dMagic2 from '../../../../../artifacts/raw/releases/v0-12/stage-live2d-magic-2.avif'
import stageMmd from '../../../../../artifacts/raw/releases/v0-12/stage-mmd.avif'
import stageTachie from '../../../../../artifacts/raw/releases/v0-12/stage-tachie.avif'
import stageVrm from '../../../../../artifacts/raw/releases/v0-12/stage-vrm.avif'
import webStageChatLight from '../../../../../artifacts/raw/releases/v0-12/web-stage-chat-light.avif'
import webStageChat from '../../../../../artifacts/raw/releases/v0-12/web-stage-chat.avif'

import { releaseThemeKey } from './release-theme'

export interface ReleaseShot {
  /** The screenshot of the dark app theme. */
  dark: string
  /** The screenshot of the light app theme. A shot without it looks the same in both themes. */
  light?: string
  /** The CSS width of the screen that took the screenshot. */
  width: number
}

/**
 * Raw screenshots of v0.12, with the CSS width of the screen that took each one.
 *
 * - Stage shots: the transparent 450x600 main window of stage-tamagotchi. The character looks the same in both themes.
 * - Desktop settings: the 600px wide settings window of stage-tamagotchi.
 * - Web settings and stage: stage-web at 1440x900.
 * - Mobile: stage-web at 390x844.
 * - Chat widgets: a 640px wide chat history.
 */
export const releaseShots = {
  chatFloatingDanmaku: { dark: chatFloatingDanmaku, light: chatFloatingDanmakuLight, width: 380 },
  chatToolCalls: { dark: chatToolCalls, light: chatToolCallsLight, width: 640 },
  mobileChat: { dark: mobileChat, light: mobileChatLight, width: 390 },
  mobileMenu: { dark: mobileMenu, light: mobileMenuLight, width: 390 },
  settingsHearing: { dark: settingsHearing, light: settingsHearingLight, width: 1440 },
  settingsLive2dImportReport: { dark: settingsLive2dImportReport, light: settingsLive2dImportReportLight, width: 600 },
  settingsLive2dMagic: { dark: settingsLive2dMagic, light: settingsLive2dMagicLight, width: 600 },
  settingsStickers: { dark: settingsStickers, light: settingsStickersLight, width: 1440 },
  settingsWakeWords: { dark: settingsWakeWords, light: settingsWakeWordsLight, width: 1440 },
  stageLive2dMagic1: { dark: stageLive2dMagic1, width: 450 },
  stageLive2dMagic2: { dark: stageLive2dMagic2, width: 450 },
  stageMmd: { dark: stageMmd, width: 450 },
  stageTachie: { dark: stageTachie, width: 450 },
  stageVrm: { dark: stageVrm, width: 450 },
  webStageChat: { dark: webStageChat, light: webStageChatLight, width: 1440 },
} satisfies Record<string, ReleaseShot>

export const releaseShotSources = Object.values(releaseShots as Record<string, ReleaseShot>)
  .flatMap(shot => shot.light ? [shot.dark, shot.light] : [shot.dark])

/** Returns a function that selects the screenshot of the theme of the current area. */
export function useReleaseShot() {
  const theme = inject(releaseThemeKey, 'dark')
  return (shot: ReleaseShot) => (theme === 'light' ? shot.light : undefined) ?? shot.dark
}
