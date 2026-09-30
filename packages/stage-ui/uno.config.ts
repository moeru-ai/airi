import { defineConfig, mergeConfigs, presetWebFonts } from 'unocss'

import { histoireUnoConfig, presetWdxlFonts, sharedUnoConfig } from '../../uno.config'

export default mergeConfigs([
  sharedUnoConfig(),
  histoireUnoConfig(),
  defineConfig({
    presets: [
      presetWebFonts({ fonts: presetWdxlFonts() }),
    ],
  }),
])
