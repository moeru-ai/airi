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
        timeouts: {
          warning: 5000,
          failure: 10000,
        },
        processors: createLocalFontProcessor(),
      }),
    ],
  }),
])
