import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import Workbench from './workbench.vue'

import '@proj-airi/ui/main.css'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
  })
}

describe('live2d motion workbench', () => {
  afterEach(() => cleanup())

  it('renders borderless tab bars and visible drop feedback', async () => {
    // ROOT CAUSE:
    //
    // The workbench used an undefined --color-primary-400 variable. Dockview
    // created its drop target, but the browser resolved its background to transparent.
    await render(Workbench, {
      attrs: { style: 'width: 1200px; height: 800px' },
      global: { plugins: [createTestI18n()] },
    })

    const workbench = document.querySelector<HTMLElement>('.dockview-theme-airi')
    expect(workbench).not.toBeNull()

    const tabBar = workbench?.querySelector<HTMLElement>('.dv-tabs-and-actions-container')
    expect(tabBar).not.toBeNull()
    expect(getComputedStyle(tabBar!).borderBottomWidth).toBe('0px')

    const dropTarget = document.createElement('div')
    dropTarget.className = 'dv-drop-target'
    dropTarget.innerHTML = '<div class="dv-drop-target-dropzone"><div class="dv-drop-target-selection"></div></div>'
    workbench!.append(dropTarget)

    const dropSelection = dropTarget.querySelector<HTMLElement>('.dv-drop-target-selection')
    expect(dropSelection).not.toBeNull()
    expect(getComputedStyle(dropSelection!).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(dropSelection!).borderStyle).toBe('none')
  })
})
