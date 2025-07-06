import type { Preset, PresetOrFactoryAwaitable } from 'unocss'

import { createExternalPackageIconLoader } from '@iconify/utils/lib/loader/external-pkg'
import { presetChromatic } from '@proj-airi/unocss-preset-chromatic'
import { colorToString } from '@unocss/preset-mini/utils'
import { defineConfig, mergeConfigs, presetAttributify, presetIcons, presetTypography, presetWebFonts, presetWind3, transformerDirectives, transformerVariantGroup } from 'unocss'
import { presetScrollbar } from 'unocss-preset-scrollbar'
import { parseColor } from 'unocss/preset-mini'

export function presetStoryMockHover(): PresetOrFactoryAwaitable {
  return {
    name: 'story-mock-hover',
    variants: [
      (matcher) => {
        if (!matcher.includes('hover')) {
          return matcher
        }

        return {
          matcher,
          selector: (s) => {
            return `${s}, ${s.replace(/:hover$/, '')}._hover`
          },
        }
      },
    ],
  }
}

export function safelistAllPrimaryBackgrounds(): string[] {
  return [
    ...[undefined, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade) => {
      const prefix = shade ? `bg-primary-${shade}` : `bg-primary`
      return [
        prefix,
        ...[5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(opacity => `${prefix}/${opacity}`),
      ]
    }).flat(),
  ]
}

export function sharedUnoConfig() {
  return defineConfig({
    presets: [
      presetWind3(),
      presetAttributify(),
      presetTypography(),
      presetWebFonts({
        fonts: {
          'sans': 'DM Sans',
          'serif': 'DM Serif Display',
          'mono': 'DM Mono',
          'cute': 'Kiwi Maru',
          'cuteen': 'Sniglet',
          'jura': 'Jura',
          'gugi': 'Gugi',
          'quicksand': 'Quicksand',
          'quanlai': {
            name: 'cjkfonts AllSeto',
            provider: 'none',
          },
          'xiaolai': {
            name: 'Xiaolai SC',
            provider: 'none',
          },
          'urbanist': 'Urbanist',
          'm-plus-rounded': 'M PLUS Rounded 1c',
        },
        timeouts: {
          warning: 5000,
          failure: 10000,
        },
      }),
      presetIcons({
        scale: 1.2,
        collections: {
          ...createExternalPackageIconLoader('@proj-airi/lobe-icons'),
        },
      }),
      presetScrollbar(),
      presetChromatic({
        baseHue: 220.44,
        colors: {
          primary: 0,
          complementary: 180,
        },
      }) as Preset,
    ],
    transformers: [
      transformerDirectives({
        applyVariable: ['--at-apply'],
      }),
      transformerVariantGroup(),
    ],
    safelist: [
      ...'prose prose-sm m-auto text-left'.split(' '),
      ...safelistAllPrimaryBackgrounds(),
    ],
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
          '(components|src)/**/*.{js,ts,vue}',
          '**/stage-ui/**/*.{vue,js,ts}',
          '**/ui/**/*.{vue,js,ts}',
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
  })
}

export function histoireUnoConfig() {
  return defineConfig({
    presets: [
      presetStoryMockHover(),
    ],
  })
}

export default mergeConfigs([
  sharedUnoConfig(),
  histoireUnoConfig(),
])
