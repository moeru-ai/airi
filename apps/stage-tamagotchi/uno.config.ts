import { createLocalFontProcessor } from '@unocss/preset-web-fonts/local'
import { defineConfig, mergeConfigs, presetWebFonts } from 'unocss'

import { sharedUnoConfig } from '../../uno.config'

export default mergeConfigs([
  sharedUnoConfig(),
  defineConfig({
    presets: [
      presetWebFonts({
        fonts: {
          'sans': {
            name: 'DM Sans Variable',
            provider: 'none',
          },
          'serif': {
            name: 'DM Serif Display',
            provider: 'none',
          },
          'mono': {
            name: 'DM Mono',
            provider: 'none',
          },
          'cute': {
            name: 'Kiwi Maru',
            provider: 'none',
          },
          'cuteen': {
            name: 'Sniglet',
            provider: 'none',
          },
          'jura': {
            name: 'Jura Variable',
            provider: 'none',
          },
          'gugi': {
            name: 'Gugi',
            provider: 'none',
          },
          'quicksand': {
            name: 'Quicksand Variable',
            provider: 'none',
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
            provider: 'none',
          },
          'm-plus-rounded': {
            name: 'M PLUS Rounded 1c',
            provider: 'none',
          },
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
