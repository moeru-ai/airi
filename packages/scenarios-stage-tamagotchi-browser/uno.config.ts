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
          failure: 10000,
          warning: 5000,
        },
      }),
    ],
  },
])
