import type { ManualResetRefReturn, RemovableRef, UseStorageOptions } from '@vueuse/core'
import type { MaybeRefOrGetter, WatchOptions } from 'vue'

import { useLocalStorage } from '@vueuse/core'
import { reactive, toRaw, toValue } from 'vue'

import { useLocalStorageManualReset } from '../use-local-storage-manual-reset'

/** The renderer that owns a group of display model settings. */
export type DisplayModelSettingsScope = 'live2d' | 'three' | 'mmd' | 'spine' | 'tachie'

interface ModelScopedStorageRegistration {
  scope: DisplayModelSettingsScope
  unscopedKey: string
  /** Returns the serialized default. Each call serializes a new copy. */
  serializeDefault: () => string
}

const MODEL_SCOPED_STORAGE_PREFIX = 'settings/models/'

const activeModelIds = reactive<Record<DisplayModelSettingsScope, string>>({
  live2d: '',
  three: '',
  mmd: '',
  spine: '',
  tachie: '',
})
const registrations: ModelScopedStorageRegistration[] = []

function browserStorage(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage
}

/**
 * Returns the storage key that holds one setting of one display model.
 *
 * @example
 * modelScopedStorageKey('model-1', 'settings/live2d/scale') // 'settings/models/model-1/live2d/scale'
 */
export function modelScopedStorageKey(modelId: string, unscopedKey: string): string {
  return `${MODEL_SCOPED_STORAGE_PREFIX}${modelId}/${unscopedKey.replace(/^settings\//, '')}`
}

function resolveStorageKey(scope: DisplayModelSettingsScope, unscopedKey: string): string {
  const modelId = activeModelIds[scope]
  return modelId ? modelScopedStorageKey(modelId, unscopedKey) : unscopedKey
}

/**
 * Serializes a default value in the format that `useStorage` reads back.
 *
 * `useStorage` selects its serializer from the type of the default. Numbers, strings, and
 * booleans are stored as plain text. Objects and arrays are stored as JSON.
 */
function serializeLikeUseStorage<T>(value: T, options?: UseStorageOptions<T>): string {
  if (options?.serializer)
    return options.serializer.write(value)
  if (typeof value === 'object' && value !== null)
    return JSON.stringify(value)
  return String(value)
}

/**
 * Writes a value for the setting of the model when the model has none.
 *
 * The storage ref wraps its default in a deep reactive proxy. In-place writes change that
 * default object, and `useStorage` returns the same object for each key that has no value.
 * A stored value for each model makes each model read its own parsed copy.
 */
function seedModelSetting(registration: ModelScopedStorageRegistration, modelId: string) {
  const storage = browserStorage()
  if (!storage || !modelId)
    return

  const scopedKey = modelScopedStorageKey(modelId, registration.unscopedKey)
  if (storage.getItem(scopedKey) != null)
    return

  // NOTICE:
  // Older releases stored one value for each renderer at the unscoped key.
  // The first model that becomes active takes that value. Later models start from the default.
  // Source: docs/ai/adr/2026-11-17-display-model-settings-per-model.md
  // Removal condition: no supported release stores model settings at the unscoped keys.
  const unscopedValue = storage.getItem(registration.unscopedKey)
  if (unscopedValue != null) {
    storage.setItem(scopedKey, unscopedValue)
    storage.removeItem(registration.unscopedKey)
    return
  }

  storage.setItem(scopedKey, registration.serializeDefault())
}

function register<T>(
  scope: DisplayModelSettingsScope,
  unscopedKey: string,
  initialValue: MaybeRefOrGetter<T>,
  options?: UseStorageOptions<T>,
): () => T {
  const copyInitialValue = (): T => typeof initialValue === 'function'
    ? toValue(initialValue)
    : structuredClone(toRaw(toValue(initialValue)))

  const registration: ModelScopedStorageRegistration = {
    scope,
    unscopedKey,
    serializeDefault: () => serializeLikeUseStorage(copyInitialValue(), options),
  }
  registrations.push(registration)
  // A store can register after its model became active. Seed before the storage ref reads.
  seedModelSetting(registration, activeModelIds[scope])

  return copyInitialValue
}

/**
 * Selects the display model that owns the settings of one renderer.
 *
 * Call it before the renderer receives the model. Each setting of the scope then reads and
 * writes the value of this model. An empty ID selects the unscoped keys.
 */
export function setActiveDisplayModelForSettings(scope: DisplayModelSettingsScope, modelId: string) {
  if (activeModelIds[scope] === modelId)
    return

  for (const registration of registrations) {
    if (registration.scope === scope)
      seedModelSetting(registration, modelId)
  }

  activeModelIds[scope] = modelId
}

/** Returns the display model that owns the settings of the renderer now. */
export function activeDisplayModelForSettings(scope: DisplayModelSettingsScope): string {
  return activeModelIds[scope]
}

/** Removes each stored setting of a display model. Call it when the model is deleted. */
export function removeDisplayModelSettings(modelId: string) {
  const storage = browserStorage()
  if (!storage || !modelId)
    return

  const prefix = `${MODEL_SCOPED_STORAGE_PREFIX}${modelId}/`
  const keys: string[] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key?.startsWith(prefix))
      keys.push(key)
  }
  for (const key of keys)
    storage.removeItem(key)
}

/**
 * A local storage ref that holds one value for each display model.
 *
 * Use when:
 * - The setting describes a display model, for example its position, motion map, or lights.
 *
 * Do not use it for a setting of the device, for example a frame rate limit or a render scale.
 *
 * @param scope - The renderer that owns the setting.
 * @param unscopedKey - The key from releases that stored one value for each renderer.
 */
export function useModelScopedLocalStorage<T>(
  scope: DisplayModelSettingsScope,
  unscopedKey: string,
  initialValue: MaybeRefOrGetter<T>,
  options?: UseStorageOptions<T>,
): RemovableRef<T> {
  const copyInitialValue = register(scope, unscopedKey, initialValue, options)
  return useLocalStorage<T>(() => resolveStorageKey(scope, unscopedKey), copyInitialValue(), options)
}

/** The same as {@link useModelScopedLocalStorage}, with a `reset()` that restores the default. */
export function useModelScopedLocalStorageManualReset<T>(
  scope: DisplayModelSettingsScope,
  unscopedKey: string,
  initialValue: MaybeRefOrGetter<T>,
  options?: UseStorageOptions<T> & WatchOptions,
): ManualResetRefReturn<T> {
  register(scope, unscopedKey, initialValue, options)
  return useLocalStorageManualReset<T>(() => resolveStorageKey(scope, unscopedKey), initialValue, options)
}

/** Clears the active models and the registered settings. Tests call it between cases. */
export function resetModelScopedLocalStorageForTesting() {
  registrations.length = 0
  for (const scope of Object.keys(activeModelIds) as DisplayModelSettingsScope[])
    activeModelIds[scope] = ''
}
