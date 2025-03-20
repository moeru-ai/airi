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

function createColorSchemeConfig(hueOffset = 0) {
  return {
    DEFAULT: `oklch(62% var(--theme-colors-chroma) calc(var(--theme-colors-hue) + ${hueOffset}))`,
    50: `color-mix(in srgb, oklch(95% var(--theme-colors-chroma-50) calc(var(--theme-colors-hue) + ${hueOffset})) 30%, oklch(100% 0 360))`,
    100: `color-mix(in srgb, oklch(95% var(--theme-colors-chroma-100) calc(var(--theme-colors-hue) + ${hueOffset})) 80%, oklch(100% 0 360))`,
    200: `oklch(90% var(--theme-colors-chroma-200) calc(var(--theme-colors-hue) + ${hueOffset}))`,
    300: `oklch(85% var(--theme-colors-chroma-300) calc(var(--theme-colors-hue) + ${hueOffset}))`,
    400: `oklch(74% var(--theme-colors-chroma-400) calc(var(--theme-colors-hue) + ${hueOffset}))`,
    500: `oklch(62% var(--theme-colors-chroma) calc(var(--theme-colors-hue) + ${hueOffset}))`,
    600: `oklch(54% var(--theme-colors-chroma-600) calc(var(--theme-colors-hue) + ${hueOffset}))`,
    700: `oklch(49% var(--theme-colors-chroma-700) calc(var(--theme-colors-hue) + ${hueOffset}))`,
    800: `oklch(42% var(--theme-colors-chroma-800) calc(var(--theme-colors-hue) + ${hueOffset}))`,
    900: `oklch(37% var(--theme-colors-chroma-900) calc(var(--theme-colors-hue) + ${hueOffset}))`,
    950: `oklch(29% var(--theme-colors-chroma-950) calc(var(--theme-colors-hue) + ${hueOffset}))`,
  }
}

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
    transformerDirectives({
      applyVariable: ['--at-apply'],
    }),
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
    ['transition-colors-none', {
      'transition-property': 'color, background-color, border-color, text-color',
      'transition-duration': '0s',
    }],
  ],
  theme: {
    colors: {
      primary: createColorSchemeConfig(),
      complementary: createColorSchemeConfig(180),
    },
  },
})
