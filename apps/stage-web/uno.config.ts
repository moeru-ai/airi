import { createExternalPackageIconLoader } from '@iconify/utils/lib/loader/external-pkg'
import { colorToString } from '@unocss/preset-mini/utils'
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
import { parseColor } from 'unocss/preset-mini'

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
  rules: [
    [/^mask-\[(.*)\]$/, ([, suffix]) => ({ '-webkit-mask-image': suffix.replace(/_/g, ' ') })],
    [/^bg-dotted-\[(.*)\]$/, ([, color], { theme }) => {
      const parsedColor = parseColor(color, theme)
      // Util usage: https://github.com/unocss/unocss/blob/f57ef6ae50006a92f444738e50f3601c0d1121f2/packages-presets/preset-mini/src/_utils/utilities.ts#L186
      return {
        'background-image': `radial-gradient(circle at 1px 1px, ${colorToString(parsedColor?.cssColor ?? parsedColor?.color ?? color, 'var(--un-background-opacity)')} 1px, transparent 0)`,
        '--un-background-opacity': parsedColor?.cssColor?.alpha ?? parsedColor?.alpha ?? 1,
      }
    }],
  ],
  theme: {
    colors: {
      primary: {
        DEFAULT: 'oklch(62% var(--theme-colors-chroma) var(--theme-colors-hue))',
        50: 'oklch(95% var(--theme-colors-chroma-50) var(--theme-colors-hue))',
        100: 'oklch(90% var(--theme-colors-chroma-100) var(--theme-colors-hue))',
        200: 'oklch(85% var(--theme-colors-chroma-200) var(--theme-colors-hue))',
        300: 'oklch(78% var(--theme-colors-chroma-300) var(--theme-colors-hue))',
        400: 'oklch(70% var(--theme-colors-chroma-400) var(--theme-colors-hue))',
        500: 'oklch(62% var(--theme-colors-chroma) var(--theme-colors-hue))',
        600: 'oklch(55% var(--theme-colors-chroma-600) var(--theme-colors-hue))',
        700: 'oklch(45% var(--theme-colors-chroma-700) var(--theme-colors-hue))',
        800: 'oklch(37% var(--theme-colors-chroma-800) var(--theme-colors-hue))',
        900: 'oklch(29% var(--theme-colors-chroma-900) var(--theme-colors-hue))',
        950: 'oklch(20% var(--theme-colors-chroma-950) var(--theme-colors-hue))',
      },
    },
  },
})
