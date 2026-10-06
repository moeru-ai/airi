import { describe, expect, it } from 'vitest'

import { extractShellResources, filterShellPrecache } from './pwa-precache'

// https://github.com/moeru-ai/airi/issues/2781
// ROOT CAUSE:
//
// Workbox's default glob includes chunks outside the HTML entry's static graph.
// The home route and PWA registration are lazy too, and HTML has a public script.
// Keep those shell dependencies while excluding unrelated route chunks.
describe('Issue #2781 Workbox precache', () => {
  it('keeps the app shell and excludes unrelated route assets', () => {
    const manifest = {
      'index.html': {
        file: 'index.html',
        isEntry: true,
        imports: ['src/main.ts'],
        dynamicImports: ['src/pages/index.vue', 'src/modules/pwa.ts', 'src/pages/settings.vue'],
      },
      'src/main.ts': {
        file: 'assets/main.js',
        imports: ['node_modules/vue.js'],
        css: ['assets/main.css'],
      },
      'node_modules/vue.js': {
        file: 'assets/vue.js',
      },
      'src/pages/index.vue': {
        file: 'assets/home-route.js',
        imports: ['src/home-shared.ts'],
        css: ['assets/home-route.css'],
      },
      'src/home-shared.ts': {
        file: 'assets/home-shared.js',
      },
      'src/modules/pwa.ts': {
        file: 'assets/pwa.js',
        imports: ['virtual:pwa-register'],
      },
      'virtual:pwa-register': {
        file: 'assets/pwa-register.js',
      },
      'src/pages/settings.vue': {
        file: 'assets/settings.js',
        css: ['assets/settings.css'],
        isDynamicEntry: true,
      },
    }

    const entries = [
      { url: './', revision: 'html' },
      { url: 'assets/main.js', revision: 'main' },
      { url: 'assets/vue.js', revision: 'vue' },
      { url: 'assets/main.css', revision: 'main-css' },
      { url: 'assets/home-route.js', revision: 'home' },
      { url: 'assets/home-shared.js', revision: 'home-shared' },
      { url: 'assets/home-route.css', revision: 'home-css' },
      { url: 'assets/pwa.js', revision: 'pwa' },
      { url: 'assets/pwa-register.js', revision: 'pwa-register' },
      { url: 'assets/settings.js', revision: 'settings' },
      { url: 'assets/settings.css', revision: 'settings-css' },
      { url: 'assets/unrelated.css', revision: 'unrelated-css' },
      { url: 'assets/js/CubismSdkForWeb-5-r.3/Core/live2dcubismcore.min.js', revision: 'public-script' },
      { url: 'favicon.svg', revision: 'favicon' },
      { url: 'web-app-manifest-192x192.png', revision: 'icon' },
    ]

    const result = filterShellPrecache(
      entries,
      manifest,
      ['./', 'favicon.svg', 'web-app-manifest-192x192.png', '/assets/js/CubismSdkForWeb-5-r.3/Core/live2dcubismcore.min.js'],
      ['src/pages/index.vue', 'src/modules/pwa.ts'],
    )

    expect(result.map(entry => entry.url)).toEqual([
      './',
      'assets/main.js',
      'assets/vue.js',
      'assets/main.css',
      'assets/home-route.js',
      'assets/home-shared.js',
      'assets/home-route.css',
      'assets/pwa.js',
      'assets/pwa-register.js',
      'assets/js/CubismSdkForWeb-5-r.3/Core/live2dcubismcore.min.js',
      'favicon.svg',
      'web-app-manifest-192x192.png',
    ])
  })

  it('extracts local script and link resources from the app shell', () => {
    const html = '<script src=/assets/app.js></script><link rel=stylesheet href=./app.css><link rel="modulepreload" href="./lazy.js"><link rel="manifest" href="https://example.com/app.webmanifest"><img data-src="/lazy.png"><link data-href="/lazy.css"><a href="/settings">Settings</a>'

    expect(extractShellResources(html)).toEqual(['/assets/app.js', './app.css'])
  })

  it('fails when the static import graph is incomplete', () => {
    const manifest = {
      'index.html': {
        file: 'index.html',
        isEntry: true,
        imports: ['src/missing.ts'],
      },
    }

    expect(() => filterShellPrecache([], manifest, [], [])).toThrow('src/missing.ts')
  })

  it('fails when Workbox omits a required shell resource', () => {
    const manifest = {
      'index.html': {
        file: 'index.html',
        isEntry: true,
        imports: ['src/main.ts'],
      },
      'src/main.ts': {
        file: 'assets/main.js',
      },
    }

    expect(() => filterShellPrecache([{ url: './' }], manifest, [], [])).toThrow('assets/main.js')
  })

  it('fails when a required shell entry is missing', () => {
    const manifest = {
      'index.html': {
        file: 'index.html',
        isEntry: true,
      },
    }

    expect(() => filterShellPrecache([], manifest, [], ['src/pages/index.vue'])).toThrow('shell entry')
  })

  it('fails when the build manifest has no HTML entry', () => {
    expect(() => filterShellPrecache([], {}, [], [])).toThrow('no HTML entry')
  })
})
