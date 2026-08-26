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
    rules: [
      ['transition-colors-none', {
        'transition-duration': '0s',
        'transition-property': 'color, background-color, border-color, text-color',
      }],
    ],
  },
])
