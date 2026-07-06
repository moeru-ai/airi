import antfu from '@antfu/eslint-config'
import boundaries from 'eslint-plugin-boundaries'

export default antfu({
  stylistic: false,
  jsonc: false,
  markdown: false,
  toml: false,
  yaml: false,
  overrides: {
    // Warn when a plain JS file exceeds 500 LOC.
    // Files over this size usually own too many responsibilities;
    // the threshold uses `skipComments`/`skipBlankLines` so it
    // targets structural sprawl.
    javascript: {
      'max-lines': ['warn', {
        max: 500,
        skipBlankLines: true,
        skipComments: true,
      }],
    },
    typescript: {
      'max-lines': ['warn', {
        max: 500,
        skipBlankLines: true,
        skipComments: true,
      }],
    },
    vue: {
      // SFCs embed <template> + <script> + <style>; allow a higher cap
      // but keep an upper bound so components don't grow unbounded.
      'max-lines': ['warn', {
        max: 600,
        skipBlankLines: true,
        skipComments: true,
      }],
    },
  },
}, {
  ignores: [
    // Local agent/tool state is not source.
    '.serena/**',
    '.superpowers/**',
    // Generated API docs bundle.
    'docs/api/api/assets/**',
    // Generated storybook output is intentionally large.
    '**/storybook-static/**',
  ],
},
// Architectural boundary enforcement ---------------------------------------------------
// Element types are inferred from import specifiers (@proj-airi/<pkg>, apps/<pkg>).
// Each workspace package is its own element. One level of indirection captures the
// element name via the `from-package` / `to-package` selectors used in `boundaries/entry-point`
// and `boundaries/no-unknown` rules below.
{
  plugins: {
    boundaries,
  },
  settings: {
    // Resolve `@proj-airi/*` workspace imports via tsconfig paths so the
    // boundaries plugin can determine which element a dependency belongs to.
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },
      node: {},
    },
    'boundaries/elements': [
      // Foundation packages: no internal deps, @moeru/* only.
      { type: 'foundation', pattern: ['packages/{server-shared,plugin-protocol,ccc,audio,model-driver-lipsync}/**'] },

      // Shared infrastructure: utilities, configs, media.
      { type: 'shared', pattern: ['packages/{i18n,font-*,electron-eventa,electron-vueuse,electron-screen-capture,model-driver-lipsync,stream-kit}/**'] },

      // SDK layers: client/server communication contracts.
      { type: 'sdk', pattern: ['packages/{server-sdk,plugin-sdk,plugin-sdk-tamagotchi,server-shared}/**'] },

      // Runtime / orchestration.
      { type: 'runtime', pattern: ['packages/{core-agent,core-character,server-runtime,pipelines-audio,server-shared}/**'] },

      // Electron-specific support for apps (event, ipc, updates).
      { type: 'electron-support', pattern: ['packages/{electron-*,electron-eventa,electron-vueuse,electron-screen-capture}/**'] },

      // Composable / primitive UI (no business logic).
      { type: 'ui-primitive', pattern: ['packages/ui/**'] },

      // 3D / character / rendering primitives (three, live2d, spine, mmd).
      { type: 'ui-stage', pattern: ['packages/{stage-ui,stage-ui-three,stage-ui-live2d,stage-ui-spine,stage-ui-mmd}/**'] },

      // Stage layouts, transitions, pages (used by stage bindings).
      { type: 'ui-stage-infra', pattern: ['packages/{stage-layouts,stage-pages,stage-shared,ui-transitions}/**'] },

      // The full Electron desktop app.
      { type: 'app', pattern: ['apps/stage-tamagotchi/**'] },
    ],
  },
  rules: {
    // Enforce dependency directions between element layers:
    // - foundation: no internal workspace deps
    // - shared: foundation only
    // - sdk: foundation + shared
    // - runtime: sdk + shared + foundation
    // - electron-support: sdk + runtime
    // - ui-primitives: no internal deps allowed (leaf UI)
    // - ui-stage: ui-primitives only
    // - ui-stage-infra: ui-stage + ui-primitives
    // - app: everything except other foundation-only packages
    'boundaries/dependencies': ['warn', {
      default: 'disallow',
      rules: [
        // Foundation: foundation->foundation only (no higher layers).
        { from: { type: 'foundation' }, allow: { to: { type: 'foundation' } } },
        { from: { type: 'foundation' }, disallow: { to: { type: ['app', 'runtime', 'sdk', 'shared', 'electron-support', 'ui-stage', 'ui-stage-infra'] } } },

        // Shared infra: foundation + shared.
        { from: { type: 'shared' }, allow: { to: { type: ['foundation', 'shared'] } } },

        // SDK layer: foundation + shared + sdk.
        { from: { type: 'sdk' }, allow: { to: { type: ['foundation', 'shared', 'sdk'] } } },

        // Runtime: foundation + shared + sdk + runtime.
        { from: { type: 'runtime' }, allow: { to: { type: ['foundation', 'shared', 'sdk', 'runtime'] } } },

        // Electron support: SDK + runtime layers.
        { from: { type: 'electron-support' }, allow: { to: { type: ['foundation', 'shared', 'sdk', 'runtime', 'electron-support'] } } },

        // UI primitives: ui-primitive only.
        { from: { type: 'ui-primitive' }, allow: { to: { type: 'ui-primitive' } } },
        { from: { type: 'ui-primitive' }, disallow: { to: { type: ['app', 'runtime', 'sdk', 'electron-support', 'ui-stage', 'ui-stage-infra'] } } },

        // Stage bindings: ui-primitive + ui-stage.
        { from: { type: 'ui-stage' }, allow: { to: { type: ['ui-primitive', 'ui-stage'] } } },

        // Stage infra (layouts, pages, etc): ui-primitive + ui-stage + ui-stage-infra.
        { from: { type: 'ui-stage-infra' }, allow: { to: { type: ['ui-primitive', 'ui-stage', 'ui-stage-infra'] } } },

        // Electron app: everything is allowed.
        { from: { type: 'app' }, allow: { to: { type: '*' } } },
      ],
    }],
  },
},
// Legacy repository cleanup rules stay visible but should not block CI while the
// existing codebase is being brought into conformance incrementally.
{
  rules: {
    '@typescript-eslint/no-var-requires': 'warn',
    'antfu/consistent-chaining': 'off',
    'antfu/consistent-list-newline': 'off',
    'antfu/if-newline': 'off',
    'block-scoped-var': 'warn',
    'eqeqeq': 'warn',
    'import/first': 'warn',
    'import/newline-after-import': 'warn',
    'import/no-duplicates': 'warn',
    'new-cap': 'warn',
    'no-cond-assign': 'warn',
    'no-console': 'warn',
    'no-control-regex': 'warn',
    'no-irregular-whitespace': 'warn',
    'no-new-wrappers': 'warn',
    'no-redeclare': 'warn',
    'no-sequences': 'warn',
    'no-throw-literal': 'warn',
    'no-undef': 'warn',
    'no-unused-expressions': 'warn',
    'no-unused-vars': 'warn',
    'no-var': 'warn',
    'node/prefer-global/buffer': 'warn',
    'node/prefer-global/process': 'warn',
    'perfectionist/sort-exports': 'off',
    'perfectionist/sort-imports': 'off',
    'perfectionist/sort-named-exports': 'off',
    'perfectionist/sort-named-imports': 'off',
    'prefer-const': 'warn',
    'prefer-regex-literals': 'warn',
    'prefer-rest-params': 'warn',
    'regexp/no-super-linear-backtracking': 'warn',
    'ts/method-signature-style': 'off',
    'ts/no-require-imports': 'warn',
    'ts/no-use-before-define': 'warn',
    'ts/no-unsafe-function-type': 'warn',
    'ts/no-unsafe-member-access': 'off',
    'unicorn/error-message': 'warn',
    'unicorn/new-for-builtins': 'warn',
    'unicorn/number-literal-case': 'warn',
    'unicorn/prefer-dom-node-text-content': 'warn',
    'unicorn/prefer-number-properties': 'warn',
    'unused-imports/no-unused-vars': 'warn',
  },
})
