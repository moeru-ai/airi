import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import CheckBar from './check-bar.vue'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        transitions: 'Disable Stage Transitions',
      },
    },
  })
}

describe('check bar', () => {
  afterEach(cleanup)

  // https://github.com/moeru-ai/airi/issues/1851
  // ROOT CAUSE:
  //
  // Unrelated icons and a hidden input made the selected state unclear and blocked keyboard input.
  // A standard switch shows the state and supports keyboard input.
  it('shows the selected state and supports keyboard input (Issue #1851)', async () => {
    const onUpdateModelValue = vi.fn()
    const screen = await render(CheckBar, {
      props: {
        'text': 'transitions',
        'modelValue': true,
        'onUpdate:modelValue': onUpdateModelValue,
      },
      global: { plugins: [createTestI18n()] },
    })

    const toggle = screen.getByRole('switch', { name: 'Disable Stage Transitions' })
    await expect.element(toggle).toBeVisible()
    await expect.element(toggle).toBeChecked()
    await toggle.click()
    expect(onUpdateModelValue).toHaveBeenLastCalledWith(false)
    await screen.rerender({ modelValue: false })
    await expect.element(toggle).not.toBeChecked()
    await toggle.element().focus()
    await userEvent.keyboard('{Space}')
    expect(onUpdateModelValue).toHaveBeenLastCalledWith(true)
  })

  // https://github.com/moeru-ai/airi/issues/1851
  // ROOT CAUSE:
  //
  // The disabled attribute reached the label instead of the hidden input.
  // Passing disabled to the switch prevents changes through the label and keyboard.
  it('keeps a disabled animation option from changing (Issue #1851)', async () => {
    const onUpdateModelValue = vi.fn()
    const screen = await render(CheckBar, {
      props: {
        'text': 'transitions',
        'modelValue': true,
        'disabled': true,
        'onUpdate:modelValue': onUpdateModelValue,
      },
      global: { plugins: [createTestI18n()] },
    })

    const toggle = screen.getByRole('switch', { name: 'Disable Stage Transitions' })
    await expect.element(toggle).toBeDisabled()
    // Click the label even when Playwright treats its associated switch as disabled.
    await screen.getByText('Disable Stage Transitions', { exact: true }).click({ force: true })
    expect(onUpdateModelValue).not.toHaveBeenCalled()
    await expect.element(toggle).toBeChecked()

    await screen.rerender({ disabled: false })
    await expect.element(toggle).toBeEnabled()
    await screen.getByText('Disable Stage Transitions', { exact: true }).click()
    expect(onUpdateModelValue).toHaveBeenLastCalledWith(false)
  })
})
