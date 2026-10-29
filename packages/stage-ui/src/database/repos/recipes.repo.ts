import type { Recipe } from '@proj-airi/core-agent'

import localforage from 'localforage'

/** One recipe, when the owner or the model added it, and when it last changed. The list keeps the order of addition. */
export interface RecipeRecord {
  recipe: Recipe
  createdAt: number
  updatedAt: number
}

/** A removed recipe stays as a tombstone with the time of the removal, so a later sync can remove it on other devices. */
interface RecipeTombstone {
  id: string
  updatedAt: number
  deleted: true
}

const records = localforage.createInstance({ name: 'airi-recipes', storeName: 'recipes' })

/** The recipes on this device, one record for each recipe, keyed by the recipe id. */
export const recipesRepo = {
  /** The recipes that are not removed, in the order of addition. */
  async list() {
    const recipes: RecipeRecord[] = []
    await records.iterate<RecipeRecord | RecipeTombstone, void>((record) => {
      if (!('deleted' in record))
        recipes.push(record)
    })
    return recipes.sort((left, right) => left.createdAt - right.createdAt)
  },
  /** A recipe from the editor can hold reactive arrays that IndexedDB cannot clone, so each record goes in as a JSON copy. */
  async save(saved: RecipeRecord[]) {
    await Promise.all(saved.map(record => records.setItem<RecipeRecord>(record.recipe.id, JSON.parse(JSON.stringify(record)))))
  },
  /** Replaces each recipe with a tombstone. */
  async remove(ids: string[], updatedAt: number) {
    await Promise.all(ids.map(id => records.setItem<RecipeTombstone>(id, { id, updatedAt, deleted: true })))
  },
  /** Deletes every record, tombstones too. Only deleting all data uses it. */
  async clear() {
    await records.clear()
  },
}
