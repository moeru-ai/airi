import type { Component } from 'vue'

import { Checkbox, FieldCheckbox } from '@proj-airi/ui'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { createApp, h, nextTick, shallowRef, withDirectives } from 'vue'

import CheckBar from '../components/scenarios/settings/check-bar.vue'

import { configureAnalyticsAdapter, disableAnalyticsCapture } from '../libs/product-signals/client'
import { captureTrackSwitchEvent } from '../libs/product-signals/events/interaction'
import { useSettingsAnalytics } from '../stores/settings/analytics'
import { createTrackSwitchDirective, trackSwitchPlugin } from './track-switch'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0))
    dispose()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function mountSwitch(component: Component, wrapper = false, acceptsChanges = true, nested = false) {
  const checked = shallowRef(false)
  const disabled = shallowRef(false)
  const name = shallowRef('test-switch')
  const capture = vi.fn()
  const directive = createTrackSwitchDirective(capture)
  const host = document.createElement('form')
  document.body.append(host)
  const app = createApp({
    render: () => {
      const control = h(component, {
        'modelValue': checked.value,
        'disabled': disabled.value,
        'label': 'Test switch',
        'text': 'Test switch',
        'name': 'test-input',
        'onUpdate:modelValue': (value: boolean) => {
          if (acceptsChanges)
            checked.value = value
        },
      })
      const tracked = withDirectives(wrapper ? h('label', ['Test switch', control]) : control, [[directive, name.value]])
      return nested ? withDirectives(h('div', tracked), [[directive, 'outer-switch']]) : tracked
    },
  })
  app.config.globalProperties.$t = (text: string) => text
  app.mount(host)
  cleanup.push(() => {
    app.unmount()
    host.remove()
  })
  const button = host.querySelector<HTMLButtonElement>('[role="switch"]')!
  return { app, host, button, checked, disabled, name, capture }
}

describe('switch tracking', () => {
  it('registers the directive without installing telemetry in UI primitives', () => {
    const app = createApp({ render: () => h('div') })
    app.use(trackSwitchPlugin)
    expect(app.directive('track-switch')).toBeDefined()
  })

  it.each([
    { name: 'field switch', component: FieldCheckbox, wrapper: false },
    { name: 'bare switch wrapper', component: Checkbox, wrapper: true },
    { name: 'settings check bar', component: CheckBar, wrapper: false },
  ])('captures one new value for $name', async ({ component, wrapper }) => {
    const state = mountSwitch(component, wrapper)
    expect(state.capture).not.toHaveBeenCalled()
    await userEvent.click(state.button)
    expect(state.capture).toHaveBeenCalledExactlyOnceWith({ control: 'test-switch', checked: true })
    await userEvent.click(state.button)
    expect(state.capture).toHaveBeenLastCalledWith({ control: 'test-switch', checked: false })
    expect(state.capture).toHaveBeenCalledTimes(2)
  })

  it('captures Enter activation without waiting for a click', async () => {
    const state = mountSwitch(FieldCheckbox)
    state.button.focus()
    await userEvent.keyboard('{Enter}')
    expect(state.capture).toHaveBeenCalledExactlyOnceWith({ control: 'test-switch', checked: true })
  })

  it('deduplicates nested tracking scopes and hidden form inputs', async () => {
    const state = mountSwitch(Checkbox, true, true, true)
    expect(state.host.querySelector('input[type="checkbox"]')).not.toBeNull()
    await userEvent.click(state.button)
    expect(state.capture).toHaveBeenCalledExactlyOnceWith({ control: 'test-switch', checked: true })
  })

  it('captures label and keyboard activation once', async () => {
    const state = mountSwitch(FieldCheckbox)
    await userEvent.click(state.host.querySelector('label')!)
    expect(state.capture).toHaveBeenCalledExactlyOnceWith({ control: 'test-switch', checked: true })
    state.button.focus()
    await userEvent.keyboard(' ')
    expect(state.capture).toHaveBeenLastCalledWith({ control: 'test-switch', checked: false })
    expect(state.capture).toHaveBeenCalledTimes(2)
  })

  it('ignores initial and external updates and disabled controls', async () => {
    const state = mountSwitch(FieldCheckbox)
    state.checked.value = true
    await nextTick()
    expect(state.capture).not.toHaveBeenCalled()
    state.disabled.value = true
    await nextTick()
    state.button.click()
    await nextTick()
    expect(state.capture).not.toHaveBeenCalled()
  })

  it('records requested values without claiming asynchronous saves succeeded', async () => {
    const controlled = mountSwitch(FieldCheckbox, false, false)
    await userEvent.click(controlled.button)
    expect(controlled.checked.value).toBe(false)
    expect(controlled.capture).toHaveBeenCalledExactlyOnceWith({ control: 'test-switch', checked: true })
    controlled.checked.value = true
    await nextTick()
    expect(controlled.capture).toHaveBeenCalledTimes(1)
  })

  it('uses updated control identifiers and removes listeners on unmount', async () => {
    const state = mountSwitch(FieldCheckbox)
    state.name.value = 'another-switch'
    await nextTick()
    await userEvent.click(state.button)
    expect(state.capture).toHaveBeenCalledExactlyOnceWith({ control: 'another-switch', checked: true })
    state.capture.mockClear()
    state.app.unmount()
    state.button.click()
    await nextTick()
    await nextTick()
    expect(state.capture).not.toHaveBeenCalled()
  })

  it('shares analytics consent and only sends the allowed fields', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const settings = useSettingsAnalytics()
    const previous = settings.analyticsEnabled
    const capture = vi.fn(() => true)
    vi.stubEnv('VITE_ENABLE_ANALYTICS', 'true')
    configureAnalyticsAdapter(async () => ({
      capture,
      getIdentitySnapshot: () => null,
      identify: vi.fn(),
      registerBuildInfo: vi.fn(),
      resetIdentity: vi.fn(),
      setCaptureEnabled: enabled => enabled,
    }))
    cleanup.push(() => {
      disableAnalyticsCapture()
      settings.analyticsEnabled = previous
      disposePinia(pinia)
    })
    settings.analyticsEnabled = false
    captureTrackSwitchEvent({ control: 'test-switch', checked: true })
    expect(capture).not.toHaveBeenCalled()
    settings.analyticsEnabled = true
    captureTrackSwitchEvent({ control: 'test-switch', checked: false })
    await vi.waitFor(() => expect(capture).toHaveBeenCalledExactlyOnceWith('switch_toggled', {
      control: 'test-switch',
      checked: false,
      environment: 'web',
    }, undefined))
    settings.analyticsEnabled = false
    captureTrackSwitchEvent({ control: 'test-switch', checked: true })
    vi.stubEnv('VITE_ENABLE_ANALYTICS', 'false')
    settings.analyticsEnabled = true
    captureTrackSwitchEvent({ control: 'test-switch', checked: true })
    expect(capture).toHaveBeenCalledTimes(1)
  })
})
