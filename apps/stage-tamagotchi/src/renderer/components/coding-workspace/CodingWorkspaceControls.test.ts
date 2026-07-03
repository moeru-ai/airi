// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import CodingWorkspaceControls from './CodingWorkspaceControls.vue'

/**
 * Mount CodingWorkspaceControls inside a local Vue app so the component can
 * resolve `useTamagotchiCodingWorkspaceStore` from the active Pinia instance.
 * Returns the host element, the app, and the store for assertions.
 */
async function mountControls() {
  const host = document.createElement('div')
  document.body.appendChild(host)

  const pinia = createPinia()
  setActivePinia(pinia)

  const app = createApp({
    render: () => h(CodingWorkspaceControls),
  })
  app.use(pinia)
  host.appendChild(document.createElement('div'))
  app.mount(host)
  await nextTick()
  await nextTick()

  const storeModule = await import('../../stores/coding-workspace')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const store = storeModule.useTamagotchiCodingWorkspaceStore(pinia)

  return {
    app,
    host,
    pinia,
    store,
  } as const
}

/**
 * Project pattern: vitest unit tests live alongside source files and exercise
 * components via `render` from `vitest-browser-vue` (see packages/stage-ui
 * .browser.test.ts). Because this run executes under the Node test project,
 * we mount via a raw Vue app + Pinia and assert on the resulting DOM.
 */
describe('codingWorkspaceControls.vue — visibility and mode badges', () => {
  beforeEach(() => {
    // Fresh Pinia per test.
    document.body.innerHTML = ''
    setActivePinia(createPinia())
  })

  it('hides the mode controls when codingContextEnabled is false and reveals them after enabling', async () => {
    const { app, host, store } = await mountControls()

    // Initially disabled: no "Disable coding context" button is rendered,
    // and the mode buttons (identified by their title) are not present.
    expect(store.codingContextEnabled).toBe(false)
    expect(host.querySelector('[aria-label="Disable coding context"]')).toBeNull()
    expect(host.querySelector('[title="Code mode"]')).toBeNull()
    // The "Enable coding context" affordance renders a "Coding" label in this state.
    expect(host.textContent).toContain('Coding')

    // Enable coding context via the store action and await reactive updates.
    await store.setCodingContextEnabled(true)
    await nextTick()
    await nextTick()

    expect(store.codingContextEnabled).toBe(true)

    // After enabling, the controls bar is visible with mode buttons.
    expect(host.querySelector('[aria-label="Disable coding context"]')).not.toBeNull()
    expect(host.querySelector('[title="Code mode"]')).not.toBeNull()
    expect(host.querySelector('[title="Ask mode"]')).not.toBeNull()
    expect(host.querySelector('[title="Spec mode"]')).not.toBeNull()
    expect(host.querySelector('[title="Debug mode"]')).not.toBeNull()

    app.unmount()
    host.remove()
  })

  it('renders active mode with aria-pressed="true" when codingMode is "code"', async () => {
    const { app, host, store } = await mountControls()

    await store.setCodingContextEnabled(true)
    store.setCodingMode('code')
    await nextTick()
    await nextTick()

    const codeModeButton = host.querySelector('[title="Code mode"]')
    expect(codeModeButton).not.toBeNull()
    expect(codeModeButton?.getAttribute('aria-pressed')).toBe('true')
    expect(codeModeButton?.textContent?.trim()).toContain('Code')

    // Other modes should not be pressed.
    const askModeButton = host.querySelector('[title="Ask mode"]')
    expect(askModeButton?.getAttribute('aria-pressed')).toBe('false')

    app.unmount()
    host.remove()
  })

  it('does NOT expose acp:pi or acp:codex engine identifiers anywhere in rendered output', async () => {
    const { app, host, store } = await mountControls()

    await store.setCodingContextEnabled(true)
    await nextTick()
    await nextTick()

    const renderedText = host.textContent ?? ''
    const renderedHtml = host.innerHTML ?? ''

    // The project requirement is "native engine only" — the renderer must not
    // advertise or allow selection of ACP engines (acp:pi, acp:codex).
    expect(renderedText).not.toContain('acp:pi')
    expect(renderedText).not.toContain('acp:codex')
    expect(renderedHtml).not.toContain('acp:pi')
    expect(renderedHtml).not.toContain('acp:codex')
    expect(renderedHtml).not.toContain('acp%3Api')
    expect(renderedHtml).not.toContain('acp%3Acodex')

    // The native engine badge should be present.
    expect(renderedText).toContain('native')

    app.unmount()
    host.remove()
  })
})
