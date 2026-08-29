import { describe, expect, it } from 'vitest'

import sharedSettingsPageSource from '../../../../../../../packages/stage-pages/src/pages/settings/models/index.vue?raw'
import desktopSettingsPageSource from './index.vue?raw'

describe('model settings scrolling', () => {
  it('does not pass native scrolling to the shared scrollable panel', () => {
    expect(desktopSettingsPageSource).not.toContain('\'overflow-y-scroll\'')
    expect(sharedSettingsPageSource).not.toContain('overflow-y-scroll')
  })
})
