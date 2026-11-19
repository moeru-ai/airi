import en from '@proj-airi/i18n/locales/en'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import DataTransferActions from './data-transfer-actions.vue'

import 'virtual:uno.css'

const clickedAnchors: HTMLAnchorElement[] = []

describe('data transfer actions', () => {
  beforeEach(() => {
    clickedAnchors.length = 0
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchors.push(this)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function renderSensitiveExport() {
    const onExport = vi.fn(async () => ({
      blob: new Blob(['credential fixture']),
      containsSensitiveInformation: true,
    }))
    const screen = await render(DataTransferActions, {
      props: {
        accept: 'application/json',
        dataArea: 'Modules',
        fileName: 'airi-modules.json',
        onExport,
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    return { screen, onExport }
  }

  it('shows a dialog before saving sensitive data and discards it on cancel', async () => {
    const { screen, onExport } = await renderSensitiveExport()

    await screen.getByRole('button', { name: 'Export Modules' }).click()

    const dialog = screen.getByRole('alertdialog')
    await expect.element(dialog).toBeVisible()
    await expect.element(screen.getByText('This file contains API keys or module credentials. Anyone who receives it can access those services.')).toBeVisible()
    expect(onExport).toHaveBeenCalledOnce()
    expect(clickedAnchors).toHaveLength(0)

    await screen.getByRole('button', { name: 'Cancel' }).click()

    await expect.element(dialog).not.toBeInTheDocument()
    expect(clickedAnchors).toHaveLength(0)
  })

  it('saves sensitive data only after the dialog confirmation', async () => {
    const { screen } = await renderSensitiveExport()

    await screen.getByRole('button', { name: 'Export Modules' }).click()
    await screen.getByRole('button', { name: 'Export with sensitive information' }).click()

    expect(clickedAnchors).toHaveLength(1)
    expect(clickedAnchors[0]?.download).toBe('airi-modules.json')
    await expect.element(screen.getByRole('alertdialog')).not.toBeInTheDocument()
  })
})
