import type { StickerEntry } from '../../types/sticker'

import localforage from 'localforage'

import { beforeEach, expect, it } from 'vitest'

import { storage } from '../storage'
import { stickersRepo as repo } from './stickers.repo'

// Releases before the unstorage migration wrote the library with localforage, in two stores of one database.
const previousEntries = localforage.createInstance({ name: 'airi-stickers', storeName: 'entries' })
const previousImages = localforage.createInstance({ name: 'airi-stickers', storeName: 'images' })

function entry(id: string, name: string): StickerEntry {
  return { id, assetId: `image-${id}`, name, emotions: ['happy'], deleted: false }
}

// Clearing the new store also removes the marker of a finished copy, like the first start of a new release.
beforeEach(async () => {
  await storage.clear('stickers')
})

// The first test runs before any test creates the old database, like a user who never ran an earlier release.
it('creates no old database for a new user, and keeps entries and images', async () => {
  await repo.save(entry('custom-new', 'New'))
  await repo.saveImage('image-custom-new', new Blob(['new image']))
  const { records, images } = await repo.read()

  expect(records).toEqual([entry('custom-new', 'New')])
  expect(images.map(image => image.id)).toEqual(['image-custom-new'])
  expect(await images[0].blob.text()).toBe('new image')
  expect((await indexedDB.databases()).map(database => database.name)).not.toContain('airi-stickers')
})

it('copies the library that an earlier release wrote, and keeps the old database', async () => {
  await previousEntries.setItem('custom-old', entry('custom-old', 'Old'))
  await previousEntries.setItem('custom-both', entry('custom-both', 'Old name'))
  await previousImages.setItem('image-custom-old', new File(['old image'], 'old.png', { type: 'image/png' }))
  // This release already saved a newer version of one entry, for example in another window.
  await storage.setItemRaw('stickers:entries:custom-both', entry('custom-both', 'New name'))

  const { records, images } = await repo.read()

  expect(records).toEqual(expect.arrayContaining([entry('custom-old', 'Old'), entry('custom-both', 'New name')]))
  expect(records).toHaveLength(2)
  expect(images.map(image => image.id)).toEqual(['image-custom-old'])
  expect(await images[0].blob.text()).toBe('old image')
  // The old database stays complete, so a rollback to an earlier release keeps every sticker.
  expect(await previousEntries.getItem('custom-old')).toEqual(entry('custom-old', 'Old'))
  expect(await previousEntries.getItem('custom-both')).toEqual(entry('custom-both', 'Old name'))
  expect(await (await previousImages.getItem<Blob>('image-custom-old'))?.text()).toBe('old image')
})

it('copies the old library only one time', async () => {
  await previousEntries.setItem('custom-removed', entry('custom-removed', 'Removed'))
  await repo.read()
  await storage.removeItem('stickers:entries:custom-removed')

  // A later start finds the finished copy and does not bring back a record that this release removed.
  const { records } = await repo.read()

  expect(records.map(record => record.id)).not.toContain('custom-removed')
})
