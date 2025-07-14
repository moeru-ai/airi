import { mergeConfigs, presetWebFonts } from 'unocss'

import { sharedUnoConfig } from '../../uno.config'

export default mergeConfigs([
  sharedUnoConfig(),
  {
    presets: [
      presetWebFonts({
        fonts: {
          'sans': {
            name: 'DM Sans Variable',
            provider: 'fontsource',
          },
          'serif': {
            name: 'DM Serif Display',
            provider: 'fontsource',
          },
          'mono': {
            name: 'DM Mono',
            provider: 'fontsource',
          },
          'cute': {
            name: 'Kiwi Maru',
            provider: 'fontsource',
          },
          'cuteen': {
            name: 'Sniglet',
            provider: 'fontsource',
          },
          'jura': {
            name: 'Jura Variable',
            provider: 'fontsource',
          },
          'gugi': {
            name: 'Gugi',
            provider: 'fontsource',
          },
          'quicksand': {
            name: 'Quicksand Variable',
            provider: 'fontsource',
          },
          'quanlai': {
            name: 'cjkfonts AllSeto',
            provider: 'none',
          },
          'xiaolai': {
            name: 'Xiaolai SC',
            provider: 'none',
          },
          'urbanist': {
            name: 'Urbanist Variable',
            provider: 'fontsource',
          },
          'm-plus-rounded': {
            name: 'M PLUS Rounded 1c',
            provider: 'fontsource',
          },
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
