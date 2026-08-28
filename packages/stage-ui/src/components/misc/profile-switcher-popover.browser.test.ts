import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ProfileSwitcherPopover from './profile-switcher-popover.vue'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en },
  })
}

describe('profile switcher', () => {
  // https://github.com/moeru-ai/airi/issues/1860
  it('keeps the create form open after Save as New Profile for Issue #1860', async () => {
    // ROOT CAUSE:
    //
    // Closing the Reka Select after choosing the create action changed `open`
    // to false. The `open` watcher then called `cancelCreate()` and removed
    // the form before the user could enter a name.
    //
    // The form now owns outside-click dismissal, while Select owns its own
    // portal lifecycle. Closing the Select therefore does not cancel creation.
    const pinia = createPinia()
    const screen = await render(ProfileSwitcherPopover, {
      global: {
        plugins: [pinia, createTestI18n()],
      },
      slots: {
        default: '<button type="button">Profile</button>',
      },
    })

    await selectCreateAction(screen)

    await expect.element(screen.getByRole('textbox')).toBeVisible()
  })

  it('cancels the create form when the user clicks outside it', async () => {
    const pinia = createPinia()
    const screen = await render(ProfileSwitcherPopover, {
      global: {
        plugins: [pinia, createTestI18n()],
      },
      slots: {
        default: '<button type="button">Profile</button>',
      },
    })

    await selectCreateAction(screen)
    await expect.element(screen.getByRole('textbox')).toBeVisible()

    const document = screen.getByRole('textbox').element().ownerDocument
    document.body.click()

    await expect.poll(() => document.querySelectorAll('input[type="text"]').length).toBe(0)
  })
})

async function selectCreateAction(screen: Awaited<ReturnType<typeof render>>) {
  await screen.getByRole('combobox').click()
  const createOption = screen.getByRole('option', { name: 'Save as New Profile' }).element()
  createOption.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  createOption.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  createOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
