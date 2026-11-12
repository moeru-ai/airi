import type { AiriCard } from '@proj-airi/stage-ui/types/airiCard'

import en from '@proj-airi/i18n/locales/en'

import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { createPinia, disposePinia } from 'pinia'
import { expect, it, onTestFinished } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import ModuleDefaultNotice from './module-default-notice.vue'

import 'virtual:uno.css'

function cardWithChatModel(provider: string, model: string): AiriCard {
  return {
    name: 'Example character',
    version: '1.0.0',
    description: '',
    extensions: {
      airi: {
        avatarModels: [],
        modules: {
          consciousness: { provider, model },
          vision: { provider: '', model: '' },
          speech: { provider: '', model: '', voice_id: '' },
        },
        agents: {},
      },
    },
  }
}

async function mountNotice(module: 'consciousness' | 'vision' | 'speech', card: AiriCard) {
  localStorage.clear()
  const pinia = createPinia()
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:path(.*)*', component: { template: '<div />' } }] })
  await router.push('/settings/modules/consciousness')
  let initialized: Promise<void> | undefined
  // The card store starts the speech store, and the speech store needs a component setup to start.
  const host = defineComponent({
    setup() {
      initialized = useAiriCardStore().initialize()
      return () => h(ModuleDefaultNotice, { module })
    },
  })
  const view = render(host, {
    global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  onTestFinished(() => {
    view.unmount()
    disposePinia(pinia)
    localStorage.clear()
  })
  const cards = useAiriCardStore(pinia)
  await initialized
  const id = await cards.addCard(card, 'import')
  await cards.activateCard(id)
  return { view, id }
}

it('tells that the selection is the default, and shows no notice for a character that inherits', async () => {
  const { view } = await mountNotice('consciousness', cardWithChatModel('', ''))

  await expect.element(view.getByText('This selection is the default for all characters.')).toBeVisible()
  await expect.element(view.getByTestId('module-default-notice-own-value')).not.toBeInTheDocument()
})

it('names the active character that has its own value, and links to its editor', async () => {
  const { view, id } = await mountNotice('consciousness', cardWithChatModel('example-provider', 'example-model'))

  await expect.element(view.getByText('Example character uses its own selection')).toBeVisible()
  await expect.element(view.getByRole('link', { name: 'Edit Example character' }))
    .toHaveAttribute('href', `/settings/airi-card/${id}/edit?section=modules`)
})

it('shows no notice on the page of a module that the character inherits', async () => {
  const { view } = await mountNotice('speech', cardWithChatModel('example-provider', 'example-model'))

  await expect.element(view.getByTestId('module-default-notice-own-value')).not.toBeInTheDocument()
})
