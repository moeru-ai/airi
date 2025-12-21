import type { BackgroundOption } from '@proj-airi/stage-ui/components'

import localforage from 'localforage'

import { useObjectUrl } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, markRaw, ref } from 'vue'

import ChromaticWavePreview from '../components/Backgrounds/ChromaticWavePreview.vue'

export type BackgroundKind = 'wave' | 'image'

export interface BackgroundSelection extends BackgroundOption {
  kind: BackgroundKind
  importedAt?: number
}

export const useBackgroundStore = defineStore('background', () => {
  const STORAGE_PREFIX = 'background-'
  const presets: BackgroundSelection[] = [
    {
      id: 'colorful-wave',
      label: 'Colorful Wave',
      description: 'Animated wave on cross grid',
      kind: 'wave',
      component: markRaw(ChromaticWavePreview),
    },
  ]

  const options = ref<BackgroundSelection[]>([...presets])
  const loading = ref(false)

  const selectedId = ref<string>(options.value[0]?.id)
  const sampledColor = ref<string>('')

  const selectedOption = computed(() => options.value.find(option => option.id === selectedId.value) ?? options.value[0])

  function setSelection(option: BackgroundSelection, color?: string) {
    selectedId.value = option.id
    if (color)
      sampledColor.value = color
  }

  async function loadFromIndexedDb() {
    if (loading.value)
      return
    loading.value = true
    const stored: BackgroundSelection[] = []
    try {
      await localforage.iterate<BackgroundSelection, void>((val, key) => {
        if (key.startsWith(STORAGE_PREFIX) && val.file instanceof File) {
          const src = useObjectUrl(ref(val.file)).value ?? URL.createObjectURL(val.file)
          stored.push({
            ...val,
            id: key,
            kind: 'image',
            src,
            component: undefined,
          })
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

  async function addOption(option: BackgroundSelection): Promise<BackgroundSelection> {
    const normalizedId = option.file ? (option.id.startsWith(STORAGE_PREFIX) ? option.id : `${STORAGE_PREFIX}${option.id}`) : option.id
    const normalizedOption: BackgroundSelection = {
      ...option,
      id: normalizedId,
      kind: option.kind ?? 'image',
      component: option.component ? markRaw(option.component) : option.component,
      src: option.file ? (useObjectUrl(ref(option.file)).value ?? URL.createObjectURL(option.file)) : option.src,
      importedAt: option.importedAt ?? Date.now(),
      blur: option.blur,
    }

    const existing = options.value.find(o => o.id === normalizedId)
    if (existing) {
      Object.assign(existing, normalizedOption)
    }
    else {
      options.value.push(normalizedOption)
    }
    selectedId.value = normalizedId

    if (normalizedOption.file) {
      const payload: BackgroundSelection = {
        ...normalizedOption,
        // ensure we store under prefix for consistency
        id: normalizedId.startsWith(STORAGE_PREFIX) ? normalizedId : `${STORAGE_PREFIX}${normalizedId}`,
      }
      try {
        await localforage.setItem(payload.id, payload)
      }
      catch (error) {
        console.error('Failed to persist background', error)
      }
    }

    return normalizedOption
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
    setSelection,
    setSampledColor,
  }
})
