import type { RouteLocationNormalizedLoaded } from 'vue-router'

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import SettingsLayout from './settings.vue'

let mockRoute: Partial<RouteLocationNormalizedLoaded> = {
  path: '/settings',
  query: {},
  meta: undefined,
}

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRoute: () => mockRoute,
    useRouter: () => ({
      back: vi.fn(),
      push: vi.fn(),
    }),
  }
})

describe('settings layout', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  function mountSettingsLayout() {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
    return mount(SettingsLayout, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          RouterView: true,
          HeaderLink: true,
          PageHeader: {
            props: ['title', 'subtitle', 'disableBackButton'],
            template: '<div class="page-header" :data-title="title" :data-subtitle="subtitle" />',
          },
        },
      },
    })
  }

  // https://github.com/moeru-ai/airi/issues/3220
  it('safely falls back when route.meta is undefined (#3220)', () => {
    mockRoute = {
      path: '/settings',
      query: {},
      meta: undefined,
    }

    const wrapper = mountSettingsLayout()
    const header = wrapper.find('.page-header')
    expect(header.exists()).toBe(true)
    expect(header.attributes('data-title')).toBe('')
    expect(header.attributes('data-subtitle')).toBeUndefined()
  })

  it('resolves title and subtitle from route.meta when available', () => {
    mockRoute = {
      path: '/settings/general',
      query: {},
      meta: {
        title: 'General Settings',
        subtitle: 'Configure general options',
      },
    }

    const wrapper = mountSettingsLayout()
    const header = wrapper.find('.page-header')
    expect(header.attributes('data-title')).toBe('General Settings')
    expect(header.attributes('data-subtitle')).toBe('Configure general options')
  })
})
