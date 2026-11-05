import { mergeConfigs, presetWebFonts } from 'unocss'

import { presetWebFontsFonts, sharedUnoConfig } from '../../uno.config'

export default mergeConfigs([
  sharedUnoConfig(),
  {
    presets: [
      presetWebFonts({
        // The fonts come from the local @fontsource packages that `src/main.ts` imports, as in stage-tamagotchi.
        // So the web build needs no font CDN and works without internet (Alice fork, offline mirror).
        fonts: {
          ...presetWebFontsFonts('none'),
        },
        timeouts: {
          warning: 5000,
          failure: 10000,
        },
      }),
    ],
    rules: [
      ['transition-colors-none', {
        'transition-property': 'color, background-color, border-color, text-color',
        'transition-duration': '0s',
      }],
    ],
  },
])
