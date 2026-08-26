import { createLocalFontProcessor } from '@unocss/preset-web-fonts/local'
import { defineConfig, mergeConfigs, presetWebFonts } from 'unocss'

import { presetWebFontsFonts, sharedUnoConfig } from '../../uno.config'

export default mergeConfigs([
  sharedUnoConfig(),
  defineConfig({
    presets: [
      presetWebFonts({
        fonts: {
          ...presetWebFontsFonts('none'),
        },
        processors: createLocalFontProcessor(),
        timeouts: {
          failure: 10000,
          warning: 5000,
        },
      }),
    ],
  }),
])
