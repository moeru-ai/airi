import type { Preset } from 'unocss'

import { presetChromatic } from '@proj-airi/unocss-preset-chromatic'
import {
  defineConfig,

  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

import { presetWebFontsFonts } from '../../uno.config'

export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
    presetTypography(),
    presetWebFonts({
      fonts: {
        ...presetWebFontsFonts('fontsource'),
      },
      timeouts: {
        warning: 5000,
        failure: 10000,
      },
    }),
    presetIcons({
      scale: 1.2,
    }),
    presetChromatic({
      baseHue: 240.25,
      colors: {
        primary: 0,
        complementary: 180,
      },
    }) as Preset,
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  safelist: 'prose prose-sm m-auto text-left'.split(' '),
})
