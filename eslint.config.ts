import antfu from '@antfu/eslint-config'

export default await antfu(
  {
    unocss: true,
    vue: true,
    ignores: [
      '**/assets/js/**',
      '**/assets/live2d/models/**',
      'apps/stage-tamagotchi/out/**',
      'apps/stage-tamagotchi/src-tauri/**',
      'crates/**',
      '**/drizzle/**',
      '**/.astro/**',
    ],
    rules: {
      'import/order': [
        'error',
        {
          'groups': [
            ['type'],
            ['builtin', 'external'],
            ['parent', 'sibling', 'index'],
          ],
          'newlines-between': 'always',
        },
      ],
    },
  },
)
