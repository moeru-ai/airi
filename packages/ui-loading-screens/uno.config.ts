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

import { presetWdxlCdn, presetWdxlFonts } from '../../uno.config'

export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
    presetTypography(),
    presetWebFonts({
      fonts: {
        'sans': 'DM Sans',
        'serif': 'DM Serif Display',
        'mono': 'DM Mono',
        'retro-mono': {
          name: 'Departure Mono',
          provider: 'none',
        },
        ...presetWdxlFonts(),
      },
      timeouts: {
        warning: 5000,
        failure: 10000,
      },
    }),
    presetWdxlCdn(),
    presetIcons({
      scale: 1.2,
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  safelist: [...'prose prose-sm m-auto text-left'.split(' '), 'font-wdxl-sc', 'font-wdxl-jp'],
})
