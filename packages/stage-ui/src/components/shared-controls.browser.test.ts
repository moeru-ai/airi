import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import WebsocketStatus from '../../../../apps/stage-pocket/src/components/websocket-status-button.vue'
import SpeechMute from '../../../../apps/stage-tamagotchi/src/renderer/components/chat-window/chat-speech-mute-button.vue'
import ChatToolbarButton from '../../../stage-layouts/src/components/Widgets/ChatToolbarButton.vue'
import Providers from '../../../stage-pages/src/pages/settings/providers/index.vue'
import ColorPicker from './data-pane/color-picker.vue'
import PropertyNumber from './data-pane/property-number.vue'
import PageHeader from './layouts/page-header.vue'
import RadioCards from './menu/radio-card-many-select.vue'
import Steppers from './misc/steppers/steppers.vue'
import ImageAttachment from './scenarios/chat/components/image-attachment-preview.vue'
import ToolShell from './scenarios/chat/components/tool-call-shell.vue'
import ValidationAlerts from './scenarios/providers/provider-validation-alerts.vue'

import { i18n } from '../../stories/modules/i18n'
import { useModsServerChannelStore } from '../stores/mods/api/channel-server'
import { useSpeechOutputControlStore } from '../stores/speech-output-control'

import 'virtual:uno.css'

const plugins = [i18n, MotionPlugin]

afterEach(cleanup)

describe('shared controls in business components', () => {
  it('forwards toolbar attributes and prevents disabled actions', async () => {
    const onClick = vi.fn()
    const disabled = ref(false)
    const Host = defineComponent({
      components: { ChatToolbarButton },
      setup: () => ({ disabled, onClick }),
      template: '<ChatToolbarButton active :disabled="disabled" aria-label="Toolbar action" @click="onClick">Chat</ChatToolbarButton>',
    })
    const screen = await render(Host)
    const button = screen.getByRole('button', { name: 'Toolbar action' })
    await button.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    disabled.value = true
    await nextTick()
    await expect.element(button).toBeDisabled()
    screen.container.querySelector<HTMLButtonElement>('button')?.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('keeps attachment removal isolated from the parent click', async () => {
    const remove = vi.fn()
    const parentClick = vi.fn()
    const file = new File(['image'], 'photo.png', { type: 'image/png' })
    const Host = defineComponent({
      components: { ImageAttachment },
      setup: () => ({ file, remove, parentClick }),
      template: '<div @click="parentClick"><ImageAttachment :file="file" @remove="remove" /></div>',
    })
    const screen = await render(Host, { global: { plugins } })
    await screen.getByRole('button', { name: /photo.png/ }).click()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('keeps tool actions separate from expanding the result', async () => {
    const action = vi.fn()
    const screen = await render(ToolShell, {
      props: { toolName: 'search', state: 'done' },
      slots: { default: 'Search result', actions: '<button type="button">Copy</button>' },
      attrs: { onClick: action },
    })
    const trigger = screen.getByRole('button', { name: 'search' })
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
    await screen.getByRole('button', { name: 'Copy' }).click()
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.click()
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect.element(screen.getByText('Search result')).toBeVisible()
    await trigger.click()
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps validation actions and the pending test disabled state', async () => {
    const onRunTest = vi.fn()
    const onGoToModelSelection = vi.fn()
    const onForceValid = vi.fn()
    const screen = await render(ValidationAlerts, {
      props: { isValid: true, isValidating: 0, validationMessage: '', hasManualValidators: true, isManualTesting: false, manualTestPassed: false, manualTestMessage: '', onRunTest, onGoToModelSelection, onForceValid },
      global: { plugins },
    })
    await screen.getByRole('button', { name: 'Ping API' }).click()
    expect(onRunTest).toHaveBeenCalledTimes(1)
    await screen.getByRole('button', { name: /Select Model/ }).click()
    expect(onGoToModelSelection).toHaveBeenCalledTimes(1)
    await screen.rerender({ isManualTesting: true })
    await expect.element(screen.getByRole('button', { name: 'Ping...' })).toBeDisabled()
    await screen.rerender({ isValid: false, isManualTesting: false, validationMessage: 'Invalid credentials' })
    await screen.getByRole('button', { name: 'Continue Anyway' }).click()
    expect(onForceValid).toHaveBeenCalledTimes(1)
  })

  it('disables hidden or unavailable page navigation', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/settings', component: { template: '<div />' } }] })
    await router.push('/settings')
    const screen = await render(PageHeader, { props: { title: 'Settings', showBackButton: false, disableBackButton: false }, global: { plugins: [...plugins, router] } })
    const back = screen.getByRole('button', { name: 'Back' })
    await expect.element(back).toBeDisabled()
    await screen.rerender({ showBackButton: true, disableBackButton: true })
    await expect.element(back).toBeDisabled()
    await screen.rerender({ disableBackButton: false })
    await expect.element(back).toBeEnabled()
  })

  it('moves between steps and emits finish at the last step', async () => {
    const finish = vi.fn()
    const screen = await render(Steppers, {
      props: { steps: [{ id: 'first', title: 'First' }, { id: 'second', title: 'Second' }], onFinish: finish },
      global: { plugins },
    })
    await expect.element(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    await screen.getByRole('button', { name: 'Next' }).click()
    await expect.element(screen.getByText('Second', { exact: true })).toBeVisible()
    await screen.getByRole('button', { name: 'Back' }).click()
    await expect.element(screen.getByText('First', { exact: true })).toBeVisible()
    await screen.getByRole('button', { name: 'Next' }).click()
    await screen.getByRole('button', { name: 'Finish' }).click()
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('filters model cards and keeps expansion reachable', async () => {
    const screen = await render(RadioCards, { props: { modelValue: 'a', items: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Gamma' }] }, global: { plugins } })
    const expand = screen.getByRole('button', { name: 'Show more' })
    await expand.click()
    await expect.element(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
    await screen.getByRole('searchbox').fill('Beta')
    await expect.element(screen.getByText('Beta', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('Alpha', { exact: true })).not.toBeInTheDocument()
    await expect.element(screen.getByText('Gamma', { exact: true })).not.toBeInTheDocument()
  })

  it('keeps numeric edits clamped and preserves formatted values', async () => {
    const value = ref(25)
    const Host = defineComponent({ components: { PropertyNumber }, setup: () => ({ value }), template: '<PropertyNumber v-model="value" :config="{ min: 0, max: 100, step: 1, precision: 1 }" />' })
    const screen = await render(Host)
    const input = screen.getByRole('spinbutton')
    await expect.element(input).toHaveValue(25)
    expect((input.element() as HTMLInputElement).value).toBe('25.0')
    await input.fill('150')
    await input.element().blur()
    await expect.poll(() => value.value).toBe(100)
    await input.fill('-20')
    await input.element().blur()
    await expect.poll(() => value.value).toBe(0)
    await input.fill('')
    await input.element().blur()
    expect(value.value).toBe(0)
  })

  it('edits colors through HEX, RGB, and HSV shared controls', async () => {
    const color = ref('#ff0000ff')
    const Host = defineComponent({ components: { ColorPicker }, setup: () => ({ color }), template: '<ColorPicker v-model="color" />' })
    const screen = await render(Host)
    await screen.getByRole('button').click()
    await page.getByPlaceholder('#000000').fill('#00ff00')
    await expect.poll(() => color.value).toBe('#00ff00ff')
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: 'RGB', exact: true }).click()
    await page.getByPlaceholder('R', { exact: true }).fill('255')
    await expect.poll(() => color.value).toBe('#ffff00ff')
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: 'HSV', exact: true }).click()
    await page.getByPlaceholder('H°', { exact: true }).fill('240')
    await expect.poll(() => color.value).toBe('#0000ffff')
    await page.getByPlaceholder('A%', { exact: true }).fill('50')
    await expect.poll(() => color.value).toBe('#0000ff80')
  })

  it('prevents editing disabled color channels', async () => {
    const screen = await render(ColorPicker, { props: { modelValue: '#ff0000ff', disabled: true } })
    await screen.getByRole('button').click()
    await expect.element(page.getByRole('combobox')).toBeDisabled()
    await expect.element(page.getByPlaceholder('#000000')).toBeDisabled()
    await expect.element(page.getByPlaceholder('A%', { exact: true })).toBeDisabled()
  })
  it('toggles desktop speech mute when the output renderer is unavailable', async () => {
    const pinia = createPinia()
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/')
    const controls = useSpeechOutputControlStore(pinia)
    controls.setSpeechMuted(false)
    const screen = await render(SpeechMute, { global: { plugins: [...plugins, pinia, router] } })
    const button = screen.getByRole('button', { name: 'Mute voice' })
    await button.click()
    await expect.element(screen.getByRole('button', { name: 'Unmute voice' })).toHaveAttribute('aria-pressed', 'true')
    expect(controls.speechMuted).toBe(true)
    await screen.getByRole('button', { name: 'Unmute voice' }).click()
    await expect.element(button).toHaveAttribute('aria-pressed', 'false')
    expect(controls.speechMuted).toBe(false)
  })

  it('opens connection settings and reflects the websocket state', async () => {
    const pinia = createPinia()
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/')
    const channel = useModsServerChannelStore(pinia)
    const screen = await render(WebsocketStatus, { global: { plugins: [...plugins, pinia, router] } })
    await screen.getByRole('button', { name: /No connection/ }).click()
    await expect.poll(() => router.currentRoute.value.path).toBe('/settings/connection')
    channel.connected = true
    await expect.element(screen.getByRole('button', { name: /Connected/ })).toBeVisible()
  })

  it('filters providers and resets filters when switching categories', async () => {
    const pinia = createPinia()
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/settings/providers')
    const screen = await render(Providers, { global: { plugins: [...plugins, pinia, router] } })
    await screen.getByRole('radio', { name: 'Free', exact: true }).click()
    await screen.getByRole('radio', { name: 'Local', exact: true }).click()
    await expect.element(screen.getByText('Ollama', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('Official Provider', { exact: true })).not.toBeInTheDocument()
    await screen.getByRole('button', { name: 'Vision', exact: true }).click()
    await expect.element(screen.getByRole('button', { name: 'Vision', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => router.currentRoute.value.hash).toBe('#vision')
    const groups = screen.getByRole('radiogroup').elements()
    for (const group of groups)
      expect(group.querySelector('[data-state="checked"]')?.textContent?.trim()).toBe('All')
  })
})
