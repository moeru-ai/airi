import type { ReleaseShot } from '../../components/release-shot'

import stageLive2dMagic2 from '../../../../../artifacts/raw/releases/v0-12/stage-live2d-magic-2.avif'
import desktopAboutLight from '../../../../../artifacts/raw/releases/v0-13/desktop-about-light.avif'
import desktopAbout from '../../../../../artifacts/raw/releases/v0-13/desktop-about.avif'
import settingsNeedsAttentionEditLight from '../../../../../artifacts/raw/releases/v0-13/settings-needs-attention-edit-light.avif'
import settingsNeedsAttentionEdit from '../../../../../artifacts/raw/releases/v0-13/settings-needs-attention-edit.avif'
import settingsNeedsAttentionLight from '../../../../../artifacts/raw/releases/v0-13/settings-needs-attention-light.avif'
import settingsNeedsAttention from '../../../../../artifacts/raw/releases/v0-13/settings-needs-attention.avif'
import settingsSearchLight from '../../../../../artifacts/raw/releases/v0-13/settings-search-light.avif'
import settingsSearchOpenLight from '../../../../../artifacts/raw/releases/v0-13/settings-search-open-light.avif'
import settingsSearchOpen from '../../../../../artifacts/raw/releases/v0-13/settings-search-open.avif'
import settingsSearch from '../../../../../artifacts/raw/releases/v0-13/settings-search.avif'
import settingsWebSearchLight from '../../../../../artifacts/raw/releases/v0-13/settings-web-search-light.avif'
import settingsWebSearch from '../../../../../artifacts/raw/releases/v0-13/settings-web-search.avif'

import { releaseShotSourcesOf } from '../../components/release-shot'

/**
 * Raw screenshots of v0.13, with the CSS width of the screen that took each one.
 *
 * - Web settings: stage-web at 1440x900. The profile has a chat provider whose check fails with a 401,
 *   a speech provider without a voice, and Always on voice input without transcription.
 * - Desktop about: the 600px wide settings window of stage-tamagotchi, with the updater state set to a download in progress.
 * - Stage: the v0.12 Live2D shot. The character did not change in v0.13.
 */
export const releaseShots = {
  desktopAbout: { dark: desktopAbout, light: desktopAboutLight, width: 600 },
  settingsNeedsAttention: { dark: settingsNeedsAttention, light: settingsNeedsAttentionLight, width: 1440 },
  settingsNeedsAttentionEdit: { dark: settingsNeedsAttentionEdit, light: settingsNeedsAttentionEditLight, width: 1440 },
  settingsSearch: { dark: settingsSearch, light: settingsSearchLight, width: 1440 },
  settingsSearchOpen: { dark: settingsSearchOpen, light: settingsSearchOpenLight, width: 1440 },
  settingsWebSearch: { dark: settingsWebSearch, light: settingsWebSearchLight, width: 1440 },
  stageLive2dMagic2: { dark: stageLive2dMagic2, width: 450 },
} satisfies Record<string, ReleaseShot>

export const releaseShotSources = releaseShotSourcesOf(releaseShots)
