import type { ElectronApplication, Page } from 'playwright'

import { env } from 'node:process'

import { defineStageTamagotchiScenario } from '../context'
import { waitForStageWindow } from '../runtime/windows'

export type DisplayModelInputFormat = 'live2d' | 'vrm' | 'mmd'

export interface DisplayModelInput {
  /** Select the AIRI importer whose accepted extensions match the file. */
  format: DisplayModelInputFormat
  /** Provide an absolute path visible to the machine running Vishot. */
  filePath: string
}

export interface ImportedDisplayModel {
  id: string
  mainPage: Page
  settingsPage: Page
  /** Restore persisted AIRI state and remove the imported IndexedDB fixture. */
  cleanup: () => Promise<void>
}

const localStorageKeys = [
  'airi-cards',
  'onboarding/completed',
  'onboarding/skipped',
  'settings/stage/model',
] as const

const localforageDatabaseName = 'localforage'
const localforageStoreName = 'keyvaluepairs'
const importedModelKeyPrefix = 'display-model-'
const modelRoutePath = '/settings/models'

/**
 * Imports and selects a display model through AIRI's user-facing model chooser.
 *
 * The returned cleanup owns every persisted value changed by this flow. Call it
 * after capture so repeated scenarios do not inherit a prior imported fixture.
 */
export async function importDisplayModelFromFile(
  electronApp: ElectronApplication,
  input: DisplayModelInput,
): Promise<ImportedDisplayModel> {
  if (!input.filePath.startsWith('/') && !/^[A-Z]:[\\/]/i.test(input.filePath))
    throw new Error('Display model input must be an absolute path')

  const mainPage = await findMainRenderer(electronApp)
  const persistedState = await snapshotPersistedState(mainPage)
  let settingsPage: Page | undefined
  let importedModelId: string | undefined

  try {
    await markOnboardingCompleted(mainPage)
    await closeOnboardingWindows(electronApp)
    await mainPage.reload({ waitUntil: 'domcontentloaded' })

    const mainWindow = await waitForStageWindow(electronApp, 'main')
    const existingModelIds = await readImportedModelIds(mainWindow.page)
    settingsPage = await openModelSettings(electronApp, mainWindow.page)
    importedModelId = await uploadModel(settingsPage, input, existingModelIds)

    await selectImportedModel(settingsPage, fileName(input.filePath))
    await waitForSelectedModel(mainWindow.page, importedModelId)

    const selectedModelId = importedModelId
    const selectedSettingsPage = settingsPage
    return {
      id: selectedModelId,
      mainPage: mainWindow.page,
      settingsPage: selectedSettingsPage,
      async cleanup() {
        await restorePersistedState(selectedSettingsPage, persistedState)
        await removeImportedModel(selectedSettingsPage, selectedModelId)
      },
    }
  }
  catch (error) {
    const cleanupPage = settingsPage ?? mainPage
    await restorePersistedState(cleanupPage, persistedState).catch(() => undefined)
    if (importedModelId)
      await removeImportedModel(cleanupPage, importedModelId).catch(() => undefined)
    throw error
  }
}

/**
 * Resolves the model input contract used by the reusable Vishot scenario.
 *
 * @example
 * // AIRI_DISPLAY_MODEL_FORMAT=vrm AIRI_DISPLAY_MODEL_PATH=/models/avatar.vrm
 * resolveDisplayModelInputFromEnvironment()
 * // => { format: 'vrm', filePath: '/models/avatar.vrm' }
 */
export function resolveDisplayModelInputFromEnvironment(
  environment: Record<string, string | undefined> = env,
): DisplayModelInput {
  const format = environment.AIRI_DISPLAY_MODEL_FORMAT
  const filePath = environment.AIRI_DISPLAY_MODEL_PATH

  if (format !== 'live2d' && format !== 'vrm' && format !== 'mmd')
    throw new Error('AIRI_DISPLAY_MODEL_FORMAT must be live2d, vrm, or mmd')

  if (!filePath)
    throw new Error('AIRI_DISPLAY_MODEL_PATH is required')

  return { format, filePath }
}

/**
 * Captures AIRI after importing the model provided through environment variables.
 *
 * Call stack:
 *
 * displayModelFromFileScenario
 *   -> {@link resolveDisplayModelInputFromEnvironment}
 *     -> {@link importDisplayModelFromFile}
 *       -> AIRI model chooser
 *         -> Vishot capture
 */
const displayModelFromFileScenario = defineStageTamagotchiScenario({
  id: 'display-model-from-file',
  async run({ capture, electronApp }) {
    const imported = await importDisplayModelFromFile(
      electronApp,
      resolveDisplayModelInputFromEnvironment(),
    )

    try {
      await imported.mainPage.locator('canvas').first().waitFor({ state: 'visible', timeout: 30_000 })
      await imported.mainPage.waitForTimeout(3_000)
      await capture('display-model-from-file', imported.mainPage)
    }
    finally {
      await imported.cleanup()
    }
  },
})

export default displayModelFromFileScenario

async function findMainRenderer(electronApp: ElectronApplication, timeout = 30_000): Promise<Page> {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      const route = hashRoute(page.url())
      if (route === '/')
        return page
    }

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error('Timed out waiting for the AIRI main renderer')
}

async function markOnboardingCompleted(page: Page): Promise<void> {
  await page.evaluate(() => {
    globalThis.localStorage.setItem('onboarding/completed', 'true')
    globalThis.localStorage.setItem('onboarding/skipped', 'false')
  })
}

async function closeOnboardingWindows(electronApp: ElectronApplication): Promise<void> {
  for (const page of electronApp.windows()) {
    if (hashRoute(page.url()).startsWith('/onboarding'))
      await page.close().catch(() => undefined)
  }
}

async function openModelSettings(electronApp: ElectronApplication, mainPage: Page): Promise<Page> {
  const settingsButton = mainPage.locator('button').filter({
    has: mainPage.locator('[i-solar\\:settings-minimalistic-outline]'),
  }).first()

  if (!await settingsButton.isVisible().catch(() => false)) {
    await mainPage.locator('button').filter({
      has: mainPage.locator('[i-solar\\:alt-arrow-up-line-duotone]'),
    }).first().click({ force: true })
    await settingsButton.waitFor({ state: 'visible', timeout: 15_000 })
  }

  await settingsButton.click({ force: true })
  const settingsWindow = await waitForStageWindow(electronApp, 'settings')
  const settingsPage = settingsWindow.page

  const settingsContentSize = { width: 1200, height: 900 }
  const nativeSettingsWindow = await electronApp.browserWindow(settingsPage)

  try {
    // A Playwright viewport override does not resize the native Electron window.
    await nativeSettingsWindow.evaluate((window, size) => {
      window.setContentSize(size.width, size.height)
    }, settingsContentSize)
  }
  finally {
    await nativeSettingsWindow.dispose()
  }

  await settingsPage.waitForFunction(size => (
    globalThis.innerWidth === size.width
    && globalThis.innerHeight === size.height
  ), settingsContentSize)

  await settingsPage.evaluate((routePath) => {
    globalThis.location.hash = routePath
  }, modelRoutePath)
  await settingsPage.waitForURL(/#\/settings\/models/)

  const selectorButton = settingsPage.getByRole('button').filter({
    hasText: /select model|选择模型|選擇模型|モデルを選択|모델 선택/i,
  }).first()
  await selectorButton.waitFor({ state: 'visible', timeout: 30_000 })
  await selectorButton.click()

  return settingsPage
}

async function uploadModel(
  settingsPage: Page,
  input: DisplayModelInput,
  existingModelIds: Set<string>,
): Promise<string> {
  const optionsButton = settingsPage.getByRole('button', { name: 'Options for Display Models' }).first()
  await optionsButton.waitFor({ state: 'visible', timeout: 15_000 })
  await optionsButton.click()

  let menuItemName = 'MMD'
  if (input.format === 'live2d')
    menuItemName = 'Live2D'
  else if (input.format === 'vrm')
    menuItemName = 'VRM'

  const [fileChooser] = await Promise.all([
    settingsPage.waitForEvent('filechooser'),
    settingsPage.getByRole('menuitem', { name: menuItemName, exact: true }).click(),
  ])
  await fileChooser.setFiles(input.filePath)

  return waitForNewImportedModelId(settingsPage, existingModelIds)
}

async function selectImportedModel(settingsPage: Page, modelFileName: string): Promise<void> {
  const modelName = settingsPage.getByText(modelFileName, { exact: true }).first()
  await modelName.waitFor({ state: 'visible', timeout: 60_000 })

  const card = modelName.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " block ")][1]')
  await card.click()

  const selectButton = card.locator('button').last()
  await selectButton.waitFor({ state: 'visible', timeout: 15_000 })
  await selectButton.click()
}

async function waitForSelectedModel(page: Page, importedModelId: string): Promise<void> {
  await page.waitForFunction((modelId) => {
    return globalThis.localStorage.getItem('settings/stage/model') === modelId
  }, importedModelId, { timeout: 30_000 })
}

async function waitForNewImportedModelId(page: Page, existingModelIds: Set<string>, timeout = 60_000): Promise<string> {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const modelIds = await readImportedModelIds(page)
    const importedModelId = [...modelIds].find(modelId => !existingModelIds.has(modelId))
    if (importedModelId)
      return importedModelId

    await page.waitForTimeout(250)
  }

  throw new Error('Timed out waiting for the imported display model')
}

async function readImportedModelIds(page: Page): Promise<Set<string>> {
  const keys = await page.evaluate(async ({ databaseName, storeName, keyPrefix }) => {
    return new Promise<string[]>((resolve, reject) => {
      const openRequest = globalThis.indexedDB.open(databaseName)
      openRequest.onerror = () => reject(openRequest.error)
      openRequest.onsuccess = () => {
        const database = openRequest.result
        if (!database.objectStoreNames.contains(storeName)) {
          database.close()
          resolve([])
          return
        }

        const transaction = database.transaction(storeName, 'readonly')
        const keysRequest = transaction.objectStore(storeName).getAllKeys()
        keysRequest.onerror = () => reject(keysRequest.error)
        keysRequest.onsuccess = () => {
          database.close()
          resolve(keysRequest.result.filter((key): key is string => typeof key === 'string' && key.startsWith(keyPrefix)))
        }
      }
    })
  }, {
    databaseName: localforageDatabaseName,
    storeName: localforageStoreName,
    keyPrefix: importedModelKeyPrefix,
  })

  return new Set(keys)
}

async function removeImportedModel(page: Page, importedModelId: string): Promise<void> {
  await page.evaluate(async ({ databaseName, storeName, modelId }) => {
    await new Promise<void>((resolve, reject) => {
      const openRequest = globalThis.indexedDB.open(databaseName)
      openRequest.onerror = () => reject(openRequest.error)
      openRequest.onsuccess = () => {
        const database = openRequest.result
        if (!database.objectStoreNames.contains(storeName)) {
          database.close()
          resolve()
          return
        }

        const transaction = database.transaction(storeName, 'readwrite')
        transaction.onerror = () => reject(transaction.error)
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.objectStore(storeName).delete(modelId)
      }
    })
  }, {
    databaseName: localforageDatabaseName,
    storeName: localforageStoreName,
    modelId: importedModelId,
  })
}

async function snapshotPersistedState(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate((keys) => {
    return Object.fromEntries(keys.map(key => [key, globalThis.localStorage.getItem(key)]))
  }, localStorageKeys)
}

async function restorePersistedState(page: Page, state: Record<string, string | null>): Promise<void> {
  await page.evaluate((persistedState) => {
    for (const [key, value] of Object.entries(persistedState)) {
      if (value === null)
        globalThis.localStorage.removeItem(key)
      else
        globalThis.localStorage.setItem(key, value)
    }
  }, state)
}

function hashRoute(url: string): string {
  const hashIndex = url.indexOf('#')
  if (hashIndex === -1)
    return ''

  return url.slice(hashIndex + 1) || '/'
}

function fileName(filePath: string): string {
  const normalizedPath = filePath.replaceAll('\\', '/')
  return normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1)
}
