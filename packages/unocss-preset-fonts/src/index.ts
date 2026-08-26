import { definePreset, LAYER_PREFLIGHTS } from '@unocss/core'
import { presetWebFonts } from '@unocss/preset-web-fonts'

export default definePreset(() => {
  return {
    name: 'preset-fonts',
    presets: [
      presetWebFonts({
        fonts: {
          quanlai: {
            name: 'cjkfonts AllSeto',
            provider: 'none',
          },
          departure: {
            name: 'Departure Mono',
            provider: 'none',
          },
          xiaolai: {
            name: 'Xiaolai SC',
            provider: 'none',
          },
        },
      }),
    ],
    preflights: [
      {
        layer: LAYER_PREFLIGHTS,
        getCSS() {
          return `
@import '@proj-airi/font-cjkfonts-allseto/index.css';
@import '@proj-airi/font-departure-mono/index.css';
@import '@proj-airi/font-xiaolai/index.css';
          `
        },
      },
    ],
  }
})
