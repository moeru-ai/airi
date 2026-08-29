import { describe, expect, it } from 'vitest'

import aboutPageSource from '../../../apps/stage-tamagotchi/src/renderer/pages/about.vue?raw'
import characterDialogSource from '../../../apps/stage-web/src/pages/settings/characters/components/CharacterDialog.vue?raw'
import onboardingDialogSource from './components/scenarios/dialogs/onboarding/onboarding-dialog.vue?raw'

describe('scrollable dialog height contracts', () => {
  it('bounds desktop changelog scrolling directly', () => {
    expect(aboutPageSource).toContain('maxHeight: \'calc(85vh - 12rem)\'')
  })

  it('bounds character form scrolling directly', () => {
    expect(characterDialogSource).toContain('maxHeight: \'calc(85vh - 8rem)\'')
  })

  it('gives desktop onboarding a definite height', () => {
    expect(onboardingDialogSource).toContain('h-[min(100dvh,48rem)]')
  })
})
