import type { Pinia } from 'pinia'

import { useHomeAssistantStore } from '@proj-airi/stage-ui/stores/modules/home-assistant'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { isProxy } from 'vue'
import { createI18n } from 'vue-i18n'

import HomeAssistantSettings from './home-assistant.vue'

import { useTamagotchiHomeAssistantStore } from '../../../stores/tools/home-assistant'

const invokeMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  request: vi.fn(),
  setConfig: vi.fn(),
}))

vi.mock('@proj-airi/electron-vueuse', async importOriginal => ({
  ...await importOriginal<typeof import('@proj-airi/electron-vueuse')>(),
  useElectronEventaInvoke: (event: { receiveEvent?: { id?: string } }) => {
    if (event?.receiveEvent?.id === 'eventa:invoke:home-assistant:get-config-receive')
      return invokeMocks.getConfig
    if (event?.receiveEvent?.id === 'eventa:invoke:home-assistant:set-config-receive')
      return invokeMocks.setConfig
    if (event?.receiveEvent?.id === 'eventa:invoke:home-assistant:request-receive')
      return invokeMocks.request

    throw new Error(`Unexpected eventa invoke: ${JSON.stringify(event)}`)
  },
}))

/** What the main process holds before the test changes anything. */
const storedConfig = {
  baseUrl: 'http://home-a.local:8123',
  hasToken: true,
  tokenPreview: 'eyJhbGciOi…8f2a',
}

const addressPlaceholder = 'settings.pages.modules.home-assistant.base-url.placeholder'
const saveLabel = 'settings.pages.modules.home-assistant.actions.save'
const failedPolicyEdit = 'settings.pages.modules.home-assistant.status.failed-policy-edit'
const reloadLabel = 'settings.pages.modules.home-assistant.access.reload'
const testLabel = 'settings.pages.modules.home-assistant.actions.test'
const testingStatus = 'settings.pages.modules.home-assistant.status.testing'
const failedPolicyMove = 'settings.pages.modules.home-assistant.status.failed-policy-move'
const exposureModeKey = 'settings/home-assistant/exposure-mode'

/**
 * Clicks one mode the way a user does.
 *
 * The label carries the text. Its `input` sits under the label, so a click
 * aimed at the input reports the label as the element that takes the pointer.
 */
function modeControl(mode: 'allow' | 'deny') {
  return page.getByText(`settings.pages.modules.home-assistant.access.mode-${mode}`)
}

async function renderPage() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const screen = await render(HomeAssistantSettings, {
    global: {
      plugins: [
        pinia,
        createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }),
      ],
    },
  })
  onTestFinished(() => screen.unmount())

  return { pinia }
}

/**
 * Puts the radio back on `all`.
 *
 * The mode is one shared value in local storage, so a test that runs after
 * another starts from the mode that test left. This writes the mode alone. A
 * write to either list is what turns that list into a plain array, and the
 * clone test below needs the state a freshly opened window reads.
 */
function resetMode(pinia: Pinia) {
  useHomeAssistantStore(pinia).exposureMode = 'all'
}

describe('homeAssistantSettings', () => {
  beforeEach(() => {
    // Each test states every mock it needs, and a queued answer of an earlier test
    // must not reach it.
    vi.resetAllMocks()
  })

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4241653856
  it('reports a device list that did not reach the leader after the address moved (PR #2903)', async () => {
    // ROOT CAUSE:
    //
    // The save read the result of the publication before the move and ignored the
    // one after it. A rejection left the leader on the list of the instance the user
    // leaves, while the page reported the clean line.
    //
    // We now read both.
    invokeMocks.getConfig.mockResolvedValue(storedConfig)
    invokeMocks.request.mockResolvedValue([])
    invokeMocks.setConfig.mockResolvedValue({ ...storedConfig, baseUrl: 'http://home-b.local:8123' })

    const pinia = (await renderPage()).pinia
    const settings = useHomeAssistantStore(pinia)
    settings.exposureMode = 'deny'
    settings.deniedEntities = ['lock.front_door']
    const toolsStore = useTamagotchiHomeAssistantStore(pinia)
    vi.spyOn(toolsStore, 'setPolicy')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('the leader window is gone'))

    await page.getByPlaceholder(addressPlaceholder).fill('http://home-b.local:8123')
    await page.getByRole('button', { name: saveLabel }).click()

    await expect.element(page.getByText(failedPolicyMove)).toBeInTheDocument()
    // The address reached the main process, so the page reports the list and not a
    // save that failed.
    expect(invokeMocks.setConfig).toHaveBeenCalledWith({ baseUrl: 'http://home-b.local:8123' })
  })

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4241734045
  it('reports a stale list from a test that moved the address (PR #2903)', async () => {
    // ROOT CAUSE:
    //
    // The test read the publication result of the save it runs and dropped it. A move
    // whose lists did not land still reported Connected.
    //
    // The test now reports the same line a save reports.
    invokeMocks.getConfig.mockResolvedValue(storedConfig)
    invokeMocks.request.mockResolvedValue([])
    invokeMocks.setConfig.mockResolvedValue({ ...storedConfig, baseUrl: 'http://home-b.local:8123' })

    const pinia = (await renderPage()).pinia
    const settings = useHomeAssistantStore(pinia)
    settings.exposureMode = 'deny'
    const toolsStore = useTamagotchiHomeAssistantStore(pinia)
    vi.spyOn(toolsStore, 'setPolicy')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('the leader window is gone'))

    await page.getByPlaceholder(addressPlaceholder).fill('http://home-b.local:8123')
    await page.getByRole('button', { name: testLabel }).click()

    await expect.element(page.getByText(failedPolicyMove)).toBeInTheDocument()
    expect(invokeMocks.setConfig).toHaveBeenCalledWith({ baseUrl: 'http://home-b.local:8123' })
  })

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4241653862
  it('reads no device list while the grid is closed (PR #2903)', async () => {
    // ROOT CAUSE:
    //
    // The route read every device on mount whoever opened it. The grid is the only
    // reader of that list, and under `all` the page hides it.
    //
    // We now wait for a mode that shows the grid.
    invokeMocks.getConfig.mockResolvedValue(storedConfig)
    invokeMocks.request.mockResolvedValue([])
    // The mode is one shared value in local storage, so this test states the one it
    // needs before the page reads it.
    localStorage.setItem(exposureModeKey, 'all')

    await renderPage()
    // The token placeholder proves the mount read landed.
    await expect.element(page.getByPlaceholder(storedConfig.tokenPreview)).toBeInTheDocument()
    expect(invokeMocks.request).not.toHaveBeenCalled()

    await modeControl('allow').click()

    await expect.poll(() => invokeMocks.request.mock.calls.length).toBe(1)
  })

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4241134264
  it('clears the lists of the instance it leaves when the mount read has not landed (PR #2903)', async () => {
    //
    // ROOT CAUSE:
    //
    // The save compared against the address the page read at mount. A save that
    // arrived first saw an empty address, and the lists of the old instance
    // survived into the new one.
    //
    // We now read the stored address when the save runs.
    invokeMocks.getConfig.mockImplementationOnce(() => new Promise(() => {}))
    invokeMocks.getConfig.mockResolvedValue(storedConfig)
    invokeMocks.request.mockResolvedValue([])
    invokeMocks.setConfig.mockResolvedValue({ ...storedConfig, baseUrl: 'http://home-b.local:8123' })

    const pinia = (await renderPage()).pinia
    const settings = useHomeAssistantStore(pinia)
    settings.allowedEntities = ['light.kitchen']

    await page.getByPlaceholder(addressPlaceholder).fill('http://home-b.local:8123')
    await page.getByRole('button', { name: saveLabel }).click()

    await expect.poll(() => settings.allowedEntities).toEqual([])
    expect(invokeMocks.setConfig).toHaveBeenCalledWith({ baseUrl: 'http://home-b.local:8123' })
  })

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4241134271
  it('reports a picker edit that the leader did not take (PR #2903)', async () => {
    //
    // The picker writes its own copy at once, so the control answers, and then
    // pushes the policy to the leader. A push that failed left the grid showing a
    // rule the model does not hold, with nothing on the page to say so.
    invokeMocks.getConfig.mockResolvedValue(storedConfig)
    invokeMocks.request.mockResolvedValue([])

    const pinia = (await renderPage()).pinia
    resetMode(pinia)
    const toolsStore = useTamagotchiHomeAssistantStore(pinia)
    vi.spyOn(toolsStore, 'setPolicy').mockRejectedValue(new Error('the leader window is gone'))

    await modeControl('allow').click()

    await expect.element(page.getByText(failedPolicyEdit)).toBeInTheDocument()
  })

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4241470132
  it('holds the reload action while a save owns the picker (PR #2903)', async () => {
    //
    // Every other picker control waits for the save that owns the lists. The
    // reload action did not, so a click inside that window read the instance the
    // save had already replaced and left its error on the page.
    invokeMocks.getConfig.mockResolvedValue(storedConfig)
    invokeMocks.request.mockResolvedValue([])
    // The save never returns, so the window this test reads stays open.
    invokeMocks.setConfig.mockImplementation(() => new Promise(() => {}))

    const pinia = (await renderPage()).pinia
    useHomeAssistantStore(pinia).exposureMode = 'allow'

    const reload = page.getByRole('button', { name: reloadLabel })
    await expect.element(reload).toBeEnabled()

    await page.getByRole('button', { name: saveLabel }).click()
    await expect.element(reload).toBeDisabled()
  })

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4241520165
  it('keeps the mode controls out of the load a test owns (PR #2903)', async () => {
    //
    // The test reports the count of the list it read. A mode change during that
    // load started a second load, which took the rows from the first, and the
    // test then reported the count of a list nobody read.
    invokeMocks.getConfig.mockResolvedValue(storedConfig)
    invokeMocks.request.mockImplementation(() => new Promise(() => {}))
    invokeMocks.setConfig.mockResolvedValue(storedConfig)

    const pinia = (await renderPage()).pinia
    const settings = useHomeAssistantStore(pinia)
    settings.exposureMode = 'allow'

    await page.getByRole('button', { name: testLabel }).click()
    await expect.element(page.getByText(testingStatus)).toBeInTheDocument()

    await modeControl('deny').click()

    expect(settings.exposureMode).toBe('allow')
  })

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4241399846
  it('hands the leader a policy that the transport can clone (PR #2903)', async () => {
    //
    // ROOT CAUSE:
    //
    // The page passed the store lists into the routed action unchanged. A follower
    // posts those arguments over a BroadcastChannel, and that clone rejects a Vue
    // reactive proxy, so every publication failed.
    //
    // We now pass a copy of each list.
    invokeMocks.getConfig.mockResolvedValue(storedConfig)
    invokeMocks.request.mockResolvedValue([])

    const pinia = (await renderPage()).pinia
    resetMode(pinia)
    const toolsStore = useTamagotchiHomeAssistantStore(pinia)
    const published: unknown[][] = []
    vi.spyOn(toolsStore, 'setPolicy').mockImplementation((...args: unknown[]) => {
      published.push(args)
      return Promise.resolve()
    })

    await modeControl('allow').click()

    await expect.poll(() => published.length).toBe(1)
    const [mode, allowed, denied] = published[0] ?? []
    expect(mode).toBe('allow')
    expect(isProxy(allowed)).toBe(false)
    expect(isProxy(denied)).toBe(false)
    // `postMessage` clones with this algorithm, so a throw here is the throw the
    // settings window takes on the wire.
    expect(() => structuredClone(published[0])).not.toThrow()
  })
})
