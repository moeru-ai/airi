import { defineConfig } from '@moeru/eslint-config'

export default defineConfig({
  oxlint: true,
  // TODO: enable this
  preferArrow: false,
  preferLet: false,
  typescript: true,
  unocss: true,
  vue: true,
}, {
  ignores: [
    '**/assets/js/**',
    '**/assets/live2d/models/**',
    'apps/stage-tamagotchi/out/**',
    'apps/stage-tamagotchi/src-tauri/**',
    'crates/**',
    '**/drizzle/**',
    '**/.astro/**',
  ],
}, {
  rules: {
    'antfu/import-dedupe': 'error',
    'import/order': 'off',
    'perfectionist/sort-imports': [
      'error',
      {
        groups: [
          'type-builtin',
          'type-import',
          'type-internal',
          ['type-parent', 'type-sibling', 'type-index'],
          'value-builtin',
          'value-external',
          'value-internal',
          ['value-parent', 'value-sibling', 'value-index'],
          ['wildcard-value-parent', 'wildcard-value-sibling', 'wildcard-value-index'],
          'side-effect',
          'style',
        ],
        newlinesBetween: 'always',
      },
    ],
    'style/padding-line-between-statements': 'error',
  },
})
