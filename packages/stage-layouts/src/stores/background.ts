import type { BackgroundOption } from '@proj-airi/stage-ui/components'
import type { Ref, ShallowRef } from 'vue'

import localforage from 'localforage'

import { useLocalStorage, useObjectUrl } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, markRaw, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { DefaultBackgroundPreview } from '../components/Backgrounds/default'

export enum BackgroundKind {
  Wave = 'wave',
  Image = 'image',
}

export interface BackgroundItem extends BackgroundOption {
  kind: BackgroundKind
  importedAt?: number
}

type PersistedBackgroundItem = Omit<BackgroundItem, 'file'> & {
  file?: Blob
}

type BackgroundPreferenceRecord = Record<string, Pick<BackgroundOption, 'id' | 'blur'>>

export const useBackgroundStore = defineStore('background', () => {
  // TODO: STORAGE_PREFIX used with multiple less maintainable `localforage` and `key.startsWith(...)` call that creates complexity.
  const STORAGE_PREFIX = 'background-'
  const presets: BackgroundItem[] = [
    {
      id: 'colorful-wave',
      label: 'Colorful Wave',
      description: 'Animated wave on cross grid',
      kind: BackgroundKind.Wave,
      component: markRaw(DefaultBackgroundPreview),
    },
  ]

  const loading = ref(false)
  const galleryOptions = useLocalStorage<BackgroundPreferenceRecord>('settings/theme/background/gallery-options', {})
  const galleryId = useLocalStorage<string>('settings/theme/background/gallery-active', presets[0]?.id)
  const storedOptions = ref<BackgroundItem[]>([])

  const sampledColor = useLocalStorage<string>('settings/theme/background/sampled-color', '')
  const selectedId = computed({
    get: () => galleryId.value,
    set: value => galleryId.value = value,
  })
  const options = computed(() => {
    const merged = [...presets, ...storedOptions.value].map((option) => {
      const stored = galleryOptions.value[option.id]
      if (!stored || stored.blur === undefined || option.blur === stored.blur)
        return option

      return {
        ...option,
        blur: stored.blur,
      }
    })

    return [...merged].sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0))
  })
  const selectedOption = computed(() => options.value.find(option => option.id === selectedId.value) ?? options.value[0])

  const blobRefs = new Map<string, ShallowRef<Blob | undefined>>()
  const urlRefs = new Map<string, Readonly<Ref<string | undefined>>>()

  watch(options, (next) => {
    if (!next.some(option => option.id === selectedId.value))
      selectedId.value = next[0]?.id
  })

  function ensureObjectUrl(id: string, blob: Blob) {
    let blobRef = blobRefs.get(id)
    let urlRef = urlRefs.get(id)

    if (!blobRef || !urlRef) {
      blobRef = shallowRef<Blob | undefined>(blob)
      blobRefs.set(id, blobRef)
      urlRef = useObjectUrl(blobRef)
      urlRefs.set(id, urlRef)
    }

    if (blobRef.value !== blob)
      blobRef.value = blob

    return urlRef!.value!
  }

  onScopeDispose(() => {
    blobRefs.clear()
    urlRefs.clear()
  })

  async function migrateDataUrlToBlob(key: string, val: PersistedBackgroundItem, dataUrl: string) {
    try {
      const blob = await (await fetch(dataUrl)).blob()
      const objectUrl = ensureObjectUrl(key, blob)

      const existingIndex = storedOptions.value.findIndex(o => o.id === key)
      if (existingIndex >= 0) {
        const existing = storedOptions.value[existingIndex]
        storedOptions.value.splice(existingIndex, 1, {
          ...existing,
          src: objectUrl,
          file: undefined,
        })
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

  function persistSelectionOptions(option: BackgroundItem) {
    const payload: Pick<BackgroundOption, 'id' | 'blur'> = {
      id: option.id,
      blur: option.blur ?? false,
    }

    galleryOptions.value = {
      ...galleryOptions.value,
      [option.id]: payload,
    }
  }

  function setSelection(option: BackgroundItem, color?: string) {
    selectedId.value = option.id
    if (color)
      sampledColor.value = color
  }

  async function applyPickerSelection(payload: { option: BackgroundOption, color?: string }) {
    const kind = payload.option.kind === BackgroundKind.Wave
      ? BackgroundKind.Wave
      : payload.option.kind === BackgroundKind.Image
        ? BackgroundKind.Image
        : BackgroundKind.Image

    const selection: BackgroundItem = {
      ...payload.option,
      kind,
    }

    persistSelectionOptions(selection)

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
            kind: BackgroundKind.Image,
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
            kind: BackgroundKind.Image,
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

    storedOptions.value = stored
    loading.value = false
  }

  void loadFromIndexedDb()

  async function addOption(option: BackgroundItem): Promise<BackgroundItem> {
    const normalizedId = option.file ? (option.id.startsWith(STORAGE_PREFIX) ? option.id : `${STORAGE_PREFIX}${option.id}`) : option.id

    const hasUploadedFile = option.file instanceof Blob
    const storedBlob = hasUploadedFile ? option.file : undefined

    const src = storedBlob
      ? ensureObjectUrl(normalizedId, storedBlob)
      : option.src

    const normalizedOption: BackgroundItem = {
      ...option,
      id: normalizedId,
      kind: option.kind ?? BackgroundKind.Image,
      component: option.component ? markRaw(option.component) : option.component,
      src,
      importedAt: option.importedAt ?? Date.now(),
      blur: option.blur,
      file: undefined,
      removable: true,
    }

    const existingIndex = storedOptions.value.findIndex(o => o.id === normalizedId)
    if (existingIndex >= 0) {
      storedOptions.value.splice(existingIndex, 1, normalizedOption)
    }
    else if (normalizedId.startsWith(STORAGE_PREFIX)) {
      storedOptions.value = [...storedOptions.value, normalizedOption]
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

    const blobRef = blobRefs.get(optionId)
    if (blobRef)
      blobRef.value = undefined

    blobRefs.delete(optionId)
    urlRefs.delete(optionId)

    const storedIndex = storedOptions.value.findIndex(o => o.id === optionId)
    if (storedIndex >= 0)
      storedOptions.value.splice(storedIndex, 1)
    if (galleryOptions.value[optionId]) {
      const { [optionId]: _, ...rest } = galleryOptions.value
      galleryOptions.value = rest
    }

    // If selected, fallback to first available option
    if (selectedId.value === optionId)
      selectedId.value = options.value[0]?.id
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
