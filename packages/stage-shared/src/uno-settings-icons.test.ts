import { describe, expect, it } from 'vitest'

import { safelistSettingsEntryIcons, sharedUnoConfig } from '../../../uno.config'

describe('settings entry icon safelist', () => {
  it('keeps settings entry icons in the shared Uno safelist', () => {
    const icons = safelistSettingsEntryIcons()
    expect(icons).toEqual([
      'i-solar:emoji-funny-square-bold-duotone',
      'i-solar:people-nearby-bold-duotone',
      'i-solar:leaf-bold-duotone',
      'i-solar:armchair-2-bold-duotone',
      'i-solar:database-bold-duotone',
      'i-solar:wi-fi-router-bold-duotone',
      'i-solar:layers-bold-duotone',
      'i-solar:box-minimalistic-bold-duotone',
      'i-solar:filters-bold-duotone',
    ])

    const config = sharedUnoConfig()
    const safelist = Array.isArray(config.safelist) ? config.safelist : []
    expect(safelist).toEqual(expect.arrayContaining(icons))
  })
})
