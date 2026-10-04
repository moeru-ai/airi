import type { StickerEntry } from '../../types/sticker'

import localforage from 'localforage'

const entries = localforage.createInstance({ name: 'airi-stickers', storeName: 'entries' })
const images = localforage.createInstance({ name: 'airi-stickers', storeName: 'images' })

/** Device-local library. Immutable image versions remain available to saved and queued replies. */
export const stickersRepo = {
  async read() {
    return navigator.locks.request('airi:sticker-library-write', async () => {
      const records: StickerEntry[] = []
      const artwork: { id: string, blob: Blob }[] = []
      await Promise.all([
        entries.iterate<StickerEntry, void>((entry) => { records.push(entry) }),
        images.iterate<Blob, void>((blob, id) => { artwork.push({ id, blob }) }),
      ])
      return { records, images: artwork }
    })
  },
  async get(id: string) {
    return entries.getItem<StickerEntry>(id)
  },
  async save(entry: StickerEntry) {
    await entries.setItem(entry.id, entry)
  },
  async saveImage(id: string, blob: Blob) {
    await images.setItem(id, blob)
  },
}
