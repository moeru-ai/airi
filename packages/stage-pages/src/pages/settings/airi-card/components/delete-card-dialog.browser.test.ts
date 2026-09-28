import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import DeleteCardDialog from './DeleteCardDialog.vue'

describe('character deletion confirmation', () => {
  it('stays open while deleting, blocks duplicate clicks, and shows a retryable failure', async () => {
    const confirm = vi.fn()
    const update = vi.fn()
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: { en: { settings: { pages: { card: {
        delete_card: 'Delete Character',
        delete_confirmation: 'Delete this character and all its bound direct conversations? Cloud copies will also be deleted.',
        cancel: 'Cancel',
        delete: 'Delete',
      } } } } },
    })
    const screen = render(DeleteCardDialog, {
      props: { 'modelValue': true, 'cardName': 'Luna', 'pending': false, 'error': '', 'onConfirm': confirm, 'onUpdate:modelValue': update },
      global: { plugins: [i18n] },
    })
    await expect.element(screen.getByText(/all its bound direct conversations/)).toBeVisible()
    await screen.getByRole('button', { name: 'Delete', exact: true }).click()
    expect(confirm).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
    await screen.rerender({ pending: true })
    await expect.element(screen.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
    await expect.element(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await screen.rerender({ pending: false, error: 'Storage is full. Try again.' })
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Storage is full. Try again.')
    await screen.getByRole('button', { name: 'Delete', exact: true }).click()
    expect(confirm).toHaveBeenCalledTimes(2)
  })
})
