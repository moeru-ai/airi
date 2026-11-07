import en from '@proj-airi/i18n/locales/en'

import { useChatFeaturesStore } from '@proj-airi/stage-ui/stores/chat/features-store'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { useStickersStore } from '@proj-airi/stage-ui/stores/modules/stickers'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import SessionFeaturesPage from './session-features.vue'

import 'virtual:uno.css'

const pinias: ReturnType<typeof createPinia>[] = []

afterEach(() => {
  cleanup()
  pinias.splice(0).forEach(pinia => disposePinia(pinia))
  localStorage.clear()
})

it('edits only the three conversation defaults and restores their initial values', async () => {
  const pinia = createPinia()
  pinias.push(pinia)
  const screen = await render(SessionFeaturesPage, {
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  const defaults = useChatFeaturesStore(pinia)
  const memory = useMemoryStore(pinia)
  const stickers = useStickersStore(pinia)
  memory.enabled = false
  stickers.enabled = true
  expect(screen.getByRole('switch').elements()).toHaveLength(3)
  expect(screen.getByRole('radiogroup').elements()).toHaveLength(0)
  expect(screen.getByRole('combobox').elements()).toHaveLength(0)
  expect(screen.getByRole('region').elements()).toHaveLength(3)
  expect(screen.getByRole('button', { name: /^About / }).elements()).toHaveLength(0)
  await expect.element(screen.getByText('Expressions and actions can accompany replies while speech is off.', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('Use instructions from enabled Skills in replies.', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('Running tasks continue. Stop them from the task list.', { exact: true })).toBeVisible()
  const reactions = screen.getByRole('switch', { name: /^Reply expressions and actions/ })
  const skills = screen.getByRole('switch', { name: /^Skill instructions/ })
  const tasks = screen.getByRole('switch', { name: /^Allow background tasks/ })
  await reactions.click()
  await skills.click()
  await tasks.click()
  expect(defaults.defaults.reactions).toBe(false)
  expect(defaults.defaults.skills).toBe(false)
  expect(defaults.defaults.tasks).toBe(false)
  await nextTick()
  const reloadedPinia = createPinia()
  pinias.push(reloadedPinia)
  const reloaded = useChatFeaturesStore(reloadedPinia)
  expect(reloaded.defaults.reactions).toBe(false)
  expect(reloaded.defaults.skills).toBe(false)
  expect(reloaded.defaults.tasks).toBe(false)
  expect(defaults.defaults.memory).toBe('off')
  expect(defaults.defaults.speech).toBe(true)
  await screen.getByRole('button', { name: 'Reset all', exact: true }).click()
  await expect.element(reactions).toBeChecked()
  await expect.element(skills).toBeChecked()
  await expect.element(tasks).toBeChecked()
  expect(memory.enabled).toBe(false)
  expect(stickers.enabled).toBe(true)
})
