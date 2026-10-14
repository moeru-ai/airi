import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { characterCardsRepo } from './character-cards.repo'

const DATABASE = 'airi-character-cards'

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const deleting = indexedDB.deleteDatabase(DATABASE)
    deleting.onsuccess = () => resolve()
    deleting.onerror = () => reject(deleting.error)
    deleting.onblocked = () => reject(new Error('Character card database remained open'))
  })
}

describe('character card history repository', () => {
  beforeEach(deleteDatabase)
  afterEach(deleteDatabase)

  it('stores field changes, removals, and restorable snapshots', async () => {
    await characterCardsRepo.write('luna', { '/name': 'Luna', '/description': 'First' })
    await characterCardsRepo.write('luna', { '/name': 'Luna', '/description': 'Second' })

    const history = await characterCardsRepo.history('luna')
    expect(history).toMatchObject([
      { revision: 2, changed: ['/description'], removed: [], source: 'local' },
      { revision: 1, changed: expect.arrayContaining(['/name', '/description']), removed: [], source: 'local' },
    ])
    expect(await characterCardsRepo.snapshot('luna', 1)).toMatchObject({
      revision: 1,
      fields: { '/name': 'Luna', '/description': 'First' },
    })

    await characterCardsRepo.write('luna', { '/name': 'Luna' })
    expect((await characterCardsRepo.history('luna'))[0]).toMatchObject({ revision: 3, changed: [], removed: ['/description'] })
    expect(await characterCardsRepo.snapshot('luna', 3)).toMatchObject({ fields: { '/name': 'Luna' } })
  })

  it('does not create a revision for an unchanged write and records deletion and restoration', async () => {
    await characterCardsRepo.write('luna', { '/name': 'Luna' })
    await characterCardsRepo.write('luna', { '/name': 'Luna' })
    await characterCardsRepo.remove('luna')

    expect(await characterCardsRepo.history('luna')).toMatchObject([
      { revision: 2, deleted: true, source: 'local' },
      { revision: 1, deleted: false },
    ])
    expect(await characterCardsRepo.deleted()).toHaveLength(1)
    await characterCardsRepo.restore('luna', 1)
    expect(await characterCardsRepo.deleted()).toEqual([])
    expect((await characterCardsRepo.history('luna'))[0]).toMatchObject({ revision: 3, deleted: false, source: 'restore' })
  })

  it('serializes writes from separate database connections', async () => {
    await Promise.all([
      characterCardsRepo.write('luna', { '/name': 'Luna' }),
      characterCardsRepo.write('luna', { '/name': 'Nova' }),
    ])

    expect((await characterCardsRepo.history('luna')).map(entry => entry.revision).sort()).toEqual([1, 2])
  })

  it('does not expose a document when writing its revision fails', async () => {
    await characterCardsRepo.write('luna', { '/name': 'Luna' })
    const snapshot = await characterCardsRepo.snapshot('luna')
    const history = await characterCardsRepo.history('luna')

    await expect(characterCardsRepo.write('luna', { '/name': 'Nova', '/scenario': () => 'A rainy city' })).rejects.toThrow()

    expect(await characterCardsRepo.snapshot('luna')).toEqual(snapshot)
    expect(await characterCardsRepo.history('luna')).toEqual(history)
    await characterCardsRepo.write('luna', { '/name': 'Nova' })
    expect(await characterCardsRepo.history('luna')).toMatchObject([
      { revision: 2, changed: ['/name'] },
      { revision: 1, changed: ['/name'] },
    ])
  })

  it('imports legacy cards once and clears the migration marker with card data', async () => {
    await characterCardsRepo.migrate([['luna', { '/name': 'Luna' }]])
    await characterCardsRepo.write('luna', { '/name': 'Nova' })
    expect(await characterCardsRepo.migrate([['luna', { '/name': 'Old card' }]])).toBe(false)
    expect(await characterCardsRepo.snapshot('luna')).toMatchObject({ fields: { '/name': 'Nova' } })

    await characterCardsRepo.clear()
    expect(await characterCardsRepo.migrate([['luna', { '/name': 'Restored import' }]])).toBe(true)
    expect(await characterCardsRepo.history('luna')).toMatchObject([
      { revision: 1, source: 'migration', changed: ['/name'] },
    ])
  })

  it('retains the latest 100 revisions and restores from its checkpoint', async () => {
    for (let revision = 0; revision < 102; revision += 1)
      await characterCardsRepo.write('luna', { '/name': `Luna ${revision}` })

    expect(await characterCardsRepo.history('luna', 200)).toHaveLength(100)
    expect(await characterCardsRepo.snapshot('luna', 1)).toBeNull()
    expect(await characterCardsRepo.snapshot('luna', 2)).toMatchObject({ fields: { '/name': 'Luna 1' } })
    expect(await characterCardsRepo.snapshot('luna', 3)).toMatchObject({ fields: { '/name': 'Luna 2' } })
  })

  it('keeps field and document tombstones when compacting the checkpoint', async () => {
    await characterCardsRepo.write('luna', { '/name': 'Luna', '/description': 'Old' })
    await characterCardsRepo.write('luna', { '/name': 'Luna' })
    await characterCardsRepo.remove('luna')
    for (let revision = 0; revision < 100; revision += 1)
      await characterCardsRepo.write('luna', { '/name': `Luna ${revision}` })

    const checkpoint = await characterCardsRepo.snapshot('luna', 3)
    expect(checkpoint).toMatchObject({ revision: 3, deleted: true, fields: { '/name': 'Luna' } })
    expect(checkpoint?.fields).not.toHaveProperty('/description')
    expect(await characterCardsRepo.snapshot('luna')).toMatchObject({ revision: 103, deleted: false, fields: { '/name': 'Luna 99' } })
  })
})
