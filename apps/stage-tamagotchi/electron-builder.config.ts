/* eslint-disable no-template-curly-in-string */

import type { Configuration } from 'electron-builder'

export default {
  appId: 'ai.moeru.airi',
  productName: 'AIRI',
  directories: {
    output: 'dist',
    buildResources: 'build',
  },
  files: [
    'out/**',
    'resources/**',
    'package.json',
    '!**/.vscode/*',
    '!src/**/*',
    '!**/node_modules/**/{CHANGELOG.md,README.md,README,readme.md,readme}',
    '!**/node_modules/**/{.turbo,test,src,__tests__,tests,example,examples}',
    'node_modules/debug/src/**',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!vite.config.{js,ts,mjs,cjs}',
    '!uno.config.{js,ts,mjs,cjs}',
    '!{.eslintcache,eslint.config.ts,.yaml,dev-app-update.yml,CHANGELOG.md,README.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    '!{tsconfig.json}',
  ],
  asar: true,
  asarUnpack: [
    '**/*.node',
  ],
  extraMetadata: {
    name: 'ai.moeru.airi',
    main: 'out/main/index.js',
    homepage: 'https://airi.moeru.ai/docs/',
    repository: 'https://github.com/moeru-ai/airi',
    license: 'MIT',
  },
  win: {
    executableName: 'airi',
  },
  nsis: {
    artifactName: '${productName}-${version}-windows-${arch}-setup.${ext}',
    shortcutName: '${productName}',
    uninstallDisplayName: '${productName}',
    createDesktopShortcut: 'always',
    deleteAppDataOnUninstall: true,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  mac: {
    entitlementsInherit: 'build/entitlements.mac.plist',
    extendInfo: [
      {
        NSMicrophoneUsageDescription: 'AIRI requires microphone access for voice interaction',
      },
      {
        NSCameraUsageDescription: 'AIRI requires camera access for vision understanding',
      },
    ],
    notarize: false,
    hardenedRuntime: false,
    executableName: 'airi',
    icon: 'icon.icon',
  },
  dmg: {
    artifactName: '${productName}-${version}-darwin-${arch}.${ext}',
  },
  linux: {
    target: [
      'deb',
      'rpm',
    ],
    category: 'Utility',
    synopsis: 'AI VTuber/Waifu chatbot app inspired by Neuro-sama.',
    description: 'AIRI is an AI VTuber/Waifu chatbot supporting Live2D/VRM avatars, featuring human-like interactions and modular stage-based rendering.',
    executableName: 'airi',
    artifactName: '${productName}-${version}-linux-${arch}.${ext}',
    icon: 'build/icons/icon.png',
  },
  appImage: {
    artifactName: '${productName}-${version}-linux-${arch}.${ext}',
  },
  npmRebuild: false,
  publish: {
    provider: 'github',
    owner: 'moeru-ai',
    repo: 'airi',
  },
} as Configuration
