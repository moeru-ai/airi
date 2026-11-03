import type { Recipe } from '@proj-airi/core-agent'

import localforage from 'localforage'

/** One recipe, its place in the list, and when it was added and last changed. */
export interface RecipeRecord {
  id: string
  recipe: Recipe
  /** The place in the list. A new recipe goes after every stored one. */
  order: number
  createdAt: number
  updatedAt: number
}

/** A removed recipe stays as a tombstone with the time of the removal, so a later sync can remove it on other devices. */
interface RecipeTombstone {
  id: string
  updatedAt: number
  deleted: true
}

type StoredRecipe = RecipeRecord | RecipeTombstone

const records = localforage.createInstance({ name: 'airi-recipes', storeName: 'recipes' })

/**
 * Runs one write. Every write of every window takes this lock, so a write that reads the stored records sees every
 * write before it, and no other write lands between its read and its save.
 */
function write<T>(run: () => Promise<T>) {
  return navigator.locks.request('airi:recipes', run)
}

/** A recipe from the editor can hold reactive arrays that IndexedDB cannot clone, so each record goes in as a JSON copy. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

async function storedRecipes() {
  const stored: StoredRecipe[] = []
  await records.iterate<StoredRecipe, void>((record) => {
    stored.push(record)
  })
  return stored
}

/** The recipes on this device, one record for each recipe, keyed by the recipe id. */
export const recipesRepo = {
  /** The recipes that are not removed, in list order. */
  async list() {
    return (await storedRecipes())
      .filter((record): record is RecipeRecord => !('deleted' in record))
      .sort((left, right) => left.order - right.order)
  },
  /** Adds recipes after every stored one, in the given order. */
  async add(recipes: Recipe[], createdAt: number) {
    await write(async () => {
      const last = (await storedRecipes()).reduce((max, record) => 'deleted' in record ? max : Math.max(max, record.order), 0)
      await Promise.all(recipes.map((recipe, index) => records.setItem<RecipeRecord>(recipe.id, plain({
        id: recipe.id,
        recipe,
        order: last + 1 + index,
        createdAt,
        updatedAt: createdAt,
      }))))
    })
  },
  /**
   * Changes some fields of one recipe on its stored record. The fields that `fields` does not name keep their stored
   * values, also when a window has not read the last change yet. A removed recipe stays removed.
   * Resolves to whether the recipe changed.
   */
  async change(id: string, fields: Partial<Recipe>, updatedAt: number) {
    return write(async () => {
      const stored = await records.getItem<StoredRecipe>(id)
      if (!stored || 'deleted' in stored)
        return false
      await records.setItem<RecipeRecord>(id, plain({ ...stored, recipe: { ...stored.recipe, ...fields }, updatedAt }))
      return true
    })
  },
  /** Replaces each recipe with a tombstone. */
  async remove(ids: string[], updatedAt: number) {
    await write(() => Promise.all(ids.map(id => records.setItem<RecipeTombstone>(id, { id, updatedAt, deleted: true }))))
  },
  /** Deletes every record, tombstones too. Only deleting all data uses it. */
  async clear() {
    await write(() => records.clear())
  },
}
