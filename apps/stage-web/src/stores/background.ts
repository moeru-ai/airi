import type { BackgroundOption } from '@proj-airi/stage-ui/components'

import localforage from 'localforage'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, markRaw, onScopeDispose, ref } from 'vue'

import ChromaticWavePreview from '../components/Backgrounds/ChromaticWavePreview.vue'

export type BackgroundKind = 'wave' | 'image'

export interface BackgroundItem extends BackgroundOption {
  kind: BackgroundKind
  importedAt?: number
}

type PersistedBackgroundItem = Omit<BackgroundItem, 'file'> & {
  file?: Blob
}

export const useBackgroundStore = defineStore('background', () => {
  // TODO: STORAGE_PREFIX used with multiple less maintainable `localforage` and `key.startsWith(...)` call that creates complexity.
  const STORAGE_PREFIX = 'background-'
  const presets: BackgroundItem[] = [
    {
      id: 'colorful-wave',
      label: 'Colorful Wave',
      description: 'Animated wave on cross grid',
      kind: 'wave',
      component: markRaw(ChromaticWavePreview),
    },
  ]

  const options = ref<BackgroundItem[]>([...presets])
  const loading = ref(false)

  const selectedId = useLocalStorage<string>('settings/theme/background/selected-id', options.value[0]?.id)
  const sampledColor = useLocalStorage<string>('settings/theme/background/sampled-color', '')

  const selectedOption = computed(() => options.value.find(option => option.id === selectedId.value) ?? options.value[0])

  const objectUrls = new Map<string, string>()

  function revokeObjectUrl(id: string) {
    const url = objectUrls.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrls.delete(id)
    }
  }

  function ensureObjectUrl(id: string, blob: Blob) {
    const existing = objectUrls.get(id)
    if (existing)
      return existing
    const created = URL.createObjectURL(blob)
    objectUrls.set(id, created)
    return created
  }

  function revokeAllObjectUrls() {
    objectUrls.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    objectUrls.clear()
  }

  const onPageHide = () => revokeAllObjectUrls()
  if ('addEventListener' in globalThis) {
    globalThis.addEventListener('pagehide', onPageHide)
  }

  onScopeDispose(() => {
    if ('removeEventListener' in globalThis) {
      globalThis.removeEventListener('pagehide', onPageHide)
    }
    revokeAllObjectUrls()
  })

  async function migrateDataUrlToBlob(key: string, val: PersistedBackgroundItem, dataUrl: string) {
    try {
      const blob = await (await fetch(dataUrl)).blob()
      const objectUrl = ensureObjectUrl(key, blob)

      const existing = options.value.find(o => o.id === key)
      if (existing) {
        existing.src = objectUrl
        existing.file = undefined
      }

      const payload: PersistedBackgroundItem = {
        ...val,
        src: undefined,
        file: blob,
      }

      await localforage.setItem<PersistedBackgroundItem>(key, payload)
    }
    catch (error) {
      console.error('Failed to migrate background data URL to Blob', error)
    }
  }

  function setSelection(option: BackgroundItem, color?: string) {
    selectedId.value = option.id
    if (color)
      sampledColor.value = color
  }

  async function applyPickerSelection(payload: { option: BackgroundOption, color?: string }) {
    const kind: BackgroundKind = payload.option.kind === 'wave' || payload.option.kind === 'image'
      ? payload.option.kind
      : 'image'

    const selection: BackgroundItem = {
      ...payload.option,
      kind,
    }

    const saved = await addOption(selection)
    setSelection(saved, payload.color)
    return saved
  }

  async function loadFromIndexedDb() {
    if (loading.value)
      return
    loading.value = true
    const stored: BackgroundItem[] = []
    try {
      await localforage.iterate<PersistedBackgroundItem, void>((val, key) => {
        if (!key.startsWith(STORAGE_PREFIX))
          return

        const storedBlob = val.file instanceof Blob ? val.file : undefined
        const storedSrc = typeof val.src === 'string' && val.src.length > 0 ? val.src : undefined

        if (storedBlob) {
          const objectUrl = ensureObjectUrl(key, storedBlob)
          stored.push({
            ...val,
            id: key,
            kind: 'image',
            src: objectUrl,
            file: undefined,
            component: undefined,
            removable: true,
          })
          return
        }

        if (storedSrc) {
          stored.push({
            ...val,
            id: key,
            kind: 'image',
            src: storedSrc,
            file: undefined,
            component: undefined,
            removable: true,
          })

          if (storedSrc.startsWith('data:')) {
            setTimeout(() => {
              void migrateDataUrlToBlob(key, val, storedSrc)
            }, 0)
          }
        }
      })
    }
    catch (error) {
      console.error('Failed to load backgrounds from IndexedDB', error)
    }

    options.value = [...presets, ...stored].sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0))
    loading.value = false
  }

  void loadFromIndexedDb()

  async function addOption(option: BackgroundItem): Promise<BackgroundItem> {
    const normalizedId = option.file ? (option.id.startsWith(STORAGE_PREFIX) ? option.id : `${STORAGE_PREFIX}${option.id}`) : option.id

    const hasUploadedFile = option.file instanceof Blob
    const storedBlob = hasUploadedFile ? option.file : undefined

    if (storedBlob)
      revokeObjectUrl(normalizedId)

    const src = storedBlob
      ? ensureObjectUrl(normalizedId, storedBlob)
      : option.src

    const normalizedOption: BackgroundItem = {
      ...option,
      id: normalizedId,
      kind: option.kind ?? 'image',
      component: option.component ? markRaw(option.component) : option.component,
      src,
      importedAt: option.importedAt ?? Date.now(),
      blur: option.blur,
      file: undefined,
      removable: true,
    }

    const existing = options.value.find(o => o.id === normalizedId)
    if (existing) {
      Object.assign(existing, normalizedOption)
    }
    else {
      options.value.push(normalizedOption)
    }
    selectedId.value = normalizedId

    if (hasUploadedFile && storedBlob) {
      const payload: PersistedBackgroundItem = {
        ...normalizedOption,
        // ensure we store under prefix for consistency
        id: normalizedId.startsWith(STORAGE_PREFIX) ? normalizedId : `${STORAGE_PREFIX}${normalizedId}`,
        src: undefined,
        file: storedBlob,
        removable: true,
      }
      try {
        await localforage.setItem<PersistedBackgroundItem>(payload.id, payload)
      }
      catch (error) {
        console.error('Failed to persist background', error)
      }
    }

    return normalizedOption
  }

  async function removeOption(optionId: string) {
    const optionIndex = options.value.findIndex(o => o.id === optionId)
    if (optionIndex === -1)
      return

    const option = options.value[optionIndex]

    // Remove from localforage
    try {
      if (option.id.startsWith(STORAGE_PREFIX)) {
        await localforage.removeItem(option.id)
      }
    }
    catch (error) {
      console.error('Failed to remove background from storage', error)
    }

    // Revoke object URL if exists
    if (objectUrls.has(optionId)) {
      revokeObjectUrl(optionId)
    }

    // Remove from list
    options.value.splice(optionIndex, 1)

    // If selected, fallback to first available option
    if (selectedId.value === optionId) {
      const fallback = options.value[0]
      if (fallback) {
        selectedId.value = fallback.id
      }
    }
  }

  function setSampledColor(color?: string) {
    if (color)
      sampledColor.value = color
  }

  return {
    options,
    selectedId,
    selectedOption,
    sampledColor,
    loading,
    loadFromIndexedDb,
    addOption,
    removeOption,
    setSelection,
    applyPickerSelection,
    setSampledColor,
  }
})
