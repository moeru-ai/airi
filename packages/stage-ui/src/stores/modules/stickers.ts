import type { StickerEntry } from '../../types/sticker'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'

import { chatStickers } from '../../assets/stickers'
import { stickersRepo } from '../../database/repos/stickers.repo'
import { StickerValidationError, validateStickerImage, validateStickerMetadata } from '../../libs/stickers/import'

/** IndexedDB owns the library. Broadcasts invalidate snapshots without sending image bytes between windows. */
export const useStickersStore = defineStore('stickers', () => {
  const enabled = useLocalStorageManualReset('settings/stickers/enabled', false)
  const frequency = useLocalStorageManualReset('settings/stickers/frequency', 50)
  const overrides = ref<StickerEntry[]>([])
  const customArtwork = ref<Record<string, string>>({})
  const error = ref(false)
  const { data, post } = useBroadcastChannel({ name: 'airi:sticker-library' })
  let disposed = false
  let pendingLoad = Promise.resolve()

  const entries = computed<StickerEntry[]>(() => {
    const records = new Map(overrides.value.map(entry => [entry.id, entry]))
    return [
      ...chatStickers.map(sticker => records.get(sticker.id) ?? {
        id: sticker.id,
        assetId: sticker.id,
        name: sticker.description,
        emotions: [...sticker.emotions],
        deleted: false,
      }),
      ...overrides.value.filter(entry => entry.id.startsWith('custom-')),
    ].filter(entry => !entry.deleted)
  })
  const artwork = computed<Record<string, string>>(() => ({
    ...Object.fromEntries(chatStickers.map(sticker => [sticker.id, sticker.src])),
    ...customArtwork.value,
  }))
  const libraryCatalog = computed(() => entries.value.map(entry => ({
    id: entry.assetId,
    description: `${entry.name}. Emotions: ${entry.emotions.join(', ')}.`,
  })))
  const catalog = computed(() => enabled.value ? libraryCatalog.value : undefined)

  /** Every awaited read includes persisted edits. Web Locks serialize writes from different renderer windows. */
  function load() {
    pendingLoad = pendingLoad.catch(() => {}).then(async () => {
      try {
        const { records, images } = await stickersRepo.read()
        if (disposed)
          return
        for (const image of images) {
          if (!customArtwork.value[image.id])
            customArtwork.value[image.id] = URL.createObjectURL(image.blob)
        }
        overrides.value = records
        error.value = false
      }
      catch (cause) {
        error.value = true
        throw cause
      }
    })
    return pendingLoad
  }

  async function save(id: string, name: string, emotions: readonly string[], file?: File) {
    const metadata = validateStickerMetadata(name, emotions)
    if (file)
      await validateStickerImage(file)
    const entry = await navigator.locks.request('airi:sticker-library-write', async () => {
      const builtin = chatStickers.find(sticker => sticker.id === id)
      const stored = await stickersRepo.get(id)
      if ((stored?.deleted || (!stored && !builtin)) && !id.startsWith('custom-'))
        throw new StickerValidationError('missing')
      if (stored?.deleted)
        throw new StickerValidationError('missing')
      if (builtin && file)
        throw new StickerValidationError('format')
      const assetId = file ? `image-${crypto.randomUUID()}` : stored?.assetId ?? builtin?.id
      if (!assetId)
        throw new StickerValidationError('image')
      if (file)
        await stickersRepo.saveImage(assetId, file)
      const saved = { id, assetId, ...metadata, deleted: false }
      await stickersRepo.save(saved)
      return saved
    })
    await load()
    post({ id })
    return entry
  }

  async function add(file: File, name: string, emotions: readonly string[]) {
    const id = `custom-${crypto.randomUUID()}`
    return save(id, name, emotions, file)
  }

  async function remove(id: string) {
    await navigator.locks.request('airi:sticker-library-write', async () => {
      const entry = await stickersRepo.get(id) ?? entries.value.find(item => item.id === id)
      if (!entry)
        throw new StickerValidationError('missing')
      // Removing eligibility retains all image versions for history and already prepared requests.
      await stickersRepo.save({ ...entry, deleted: true })
    })
    await load()
    post({ id })
  }

  /** Freeze eligibility before loading. Copy model metadata before provider startup or a queue wait. */
  async function selectCatalogForReply() {
    if (!enabled.value || (frequency.value < 100 && Math.random() * 100 >= frequency.value))
      return undefined
    await load()
    return libraryCatalog.value.map(sticker => ({ ...sticker }))
  }

  function resetState() {
    enabled.value = false
    frequency.value = 50
  }

  watch(data, () => {
    void load().catch(() => {})
  })
  void load().catch(() => {})
  onScopeDispose(() => {
    disposed = true
    for (const src of Object.values(customArtwork.value))
      URL.revokeObjectURL(src)
  })
  return { enabled, frequency, entries, artwork, catalog, error, load, add, save, remove, selectCatalogForReply, resetState }
})
