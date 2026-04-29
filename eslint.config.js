import { defineConfig } from '@moeru/eslint-config'

export default defineConfig({
  masknet: false,
  preferArrow: false,
  perfectionist: false,
  sonarjs: false,
  sortPackageJsonScripts: false,
  typescript: true,
  unocss: true,
  vue: true,
}, {
  ignores: [
    'cspell.config.yaml',
    'cspell.config.yml',
    'crowdin.yaml',
    'crowdin.yml',
    '**/assets/js/**',
    '**/assets/live2d/models/**',
    'apps/stage-tamagotchi/out/**',
    'apps/stage-tamagotchi/src/bindings/**',
    'apps/stage-tamagotchi-electron/out/**',
    'apps/stage-tamagotchi-electron/src/renderer/bindings/**',
    'apps/stage-pocket/ios/**',
    'apps/stage-pocket/android/**',
    '**/drizzle/**',
    '**/.astro/**',
    '.agents/**',
    '.github/**',
    'CLAUDE.md', // Skip the symbolic link
  ],
}, {
  rules: {
    'pnpm/json-valid-catalog': 'off',
    'pnpm/json-enforce-catalog': 'off',
    'pnpm/yaml-enforce-settings': 'off',
    'antfu/import-dedupe': 'error',
    // TODO: remove this
    'depend/ban-dependencies': 'warn',
    'import/order': 'off',
    'no-console': ['error', { allow: ['warn', 'error', 'info'] }],

    // Catches the manual `error instanceof Error ? error.message : ...`
    // pattern AGENTS.md forbids. The selector matches a ConditionalExpression
    // whose test is `<x> instanceof Error` and whose consequent is `<x>.message`,
    // so it does NOT false-positive on `error instanceof Error ? error : new Error(...)`
    // (where the consequent is the error itself, not its `.message`). Antfu's
    // default no-restricted-syntax patterns are preserved alongside.
    'no-restricted-syntax': [
      'warn',
      {
        selector: 'ConditionalExpression[test.type=\'BinaryExpression\'][test.operator=\'instanceof\'][test.right.name=\'Error\'][consequent.type=\'MemberExpression\'][consequent.property.name=\'message\']',
        message: 'Avoid `error instanceof Error ? error.message : ...`. Use `errorMessageFrom(error)` from \'@moeru/std\' (or `errorMessageFromUnknown(error, fallback)` from \'@proj-airi/stage-shared\'). Pair with `?? \'fallback\'` when a default is needed.',
      },
      'TSEnumDeclaration[const=true]',
      'TSExportAssignment',
    ],

    // 'sonarjs/cognitive-complexity': 'off',
    // 'sonarjs/no-commented-code': 'off',
    // 'sonarjs/pseudo-random': 'off',
    'style/padding-line-between-statements': 'error',
    'vue/prefer-separate-static-class': 'off',
    'yaml/plain-scalar': 'off',
    'markdown/require-alt-text': 'off',
  },
}, {
  ignores: [
    '**/*.md',
  ],
  rules: {
    'perfectionist/sort-imports': [
      'error',
      {
        groups: [
          'type-builtin',
          'type-import',
          'type-internal',
          ['type-parent', 'type-sibling', 'type-index'],
          'default-value-builtin',
          'named-value-builtin',
          'value-builtin',
          'default-value-external',
          'named-value-external',
          'value-external',
          'default-value-internal',
          'named-value-internal',
          'value-internal',
          ['default-value-parent', 'default-value-sibling', 'default-value-index'],
          ['named-value-parent', 'named-value-sibling', 'named-value-index'],
          ['wildcard-value-parent', 'wildcard-value-sibling', 'wildcard-value-index'],
          ['value-parent', 'value-sibling', 'value-index'],
          'side-effect',
          'style',
        ],
        newlinesBetween: 1,
      },
    ],
  },
})
