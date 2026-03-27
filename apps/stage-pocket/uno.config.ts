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
    rules: [
      ['transition-colors-none', {
        'transition-property': 'color, background-color, border-color, text-color',
        'transition-duration': '0s',
      }],

      ['pt-safe', { 'padding-top': 'env(safe-area-inset-top)' }],
      ['pb-safe', { 'padding-bottom': 'env(safe-area-inset-bottom)' }],
      ['pl-safe', { 'padding-left': 'env(safe-area-inset-left)' }],
      ['pr-safe', { 'padding-right': 'env(safe-area-inset-right)' }],
      ['p-safe', {
        'padding-top': 'env(safe-area-inset-top)',
        'padding-bottom': 'env(safe-area-inset-bottom)',
        'padding-left': 'env(safe-area-inset-left)',
        'padding-right': 'env(safe-area-inset-right)',
      }],
    ],
    shortcuts: [
      ['px-safe', 'pl-safe pr-safe'],
      ['py-safe', 'pt-safe pb-safe'],
    ],
  },
])
