import { createExternalPackageIconLoader } from '@iconify/utils/lib/loader/external-pkg'
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
import { presetScrollbar } from 'unocss-preset-scrollbar'

import UnoCSSConfig from '../../uno.config'

export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: 'DM Sans',
        serif: 'DM Serif Display',
        mono: 'DM Mono',
        cute: 'Kiwi Maru',
        cuteen: 'Sniglet',
      },
    }),
    presetIcons({
      scale: 1.2,
      collections: {
        ...createExternalPackageIconLoader('@proj-airi/lobe-icons'),
      },
    }),
      presetScrollbar(),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  safelist: 'prose prose-sm m-auto text-left'.split(' '),
  // hyoban/unocss-preset-shadcn: Use shadcn ui with UnoCSS
  // https://github.com/hyoban/unocss-preset-shadcn
  //
  // Thanks to
  // https://github.com/unovue/shadcn-vue/issues/34#issuecomment-2467318118
  // https://github.com/hyoban-template/shadcn-vue-unocss-starter
  //
  // By default, `.ts` and `.js` files are NOT extracted.
  // If you want to extract them, use the following configuration.
  // It's necessary to add the following configuration if you use shadcn-vue or shadcn-svelte.
  content: {
    pipeline: {
      include: [
      // the default
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        // include js/ts files
        '(components|src)/**/*.{js,ts}',
      ],
    },
  },
})
