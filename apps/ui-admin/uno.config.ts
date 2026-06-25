import { mergeConfigs, presetWebFonts } from 'unocss'

import { presetWebFontsFonts, sharedUnoConfig } from '../../uno.config'

export default mergeConfigs([
  sharedUnoConfig(),
  {
    presets: [
      presetWebFonts({
        fonts: {
          ...presetWebFontsFonts('fontsource'),
        },
        timeouts: {
          warning: 5000,
          failure: 10000,
        },
      }),
    ],
  },
])
