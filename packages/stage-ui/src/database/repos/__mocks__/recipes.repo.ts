import type { RecipeRecord } from '../recipes.repo'

/** In-memory recipes for Node tests, which have no IndexedDB. */
const records = new Map<string, RecipeRecord>()

export const recipesRepo = {
  async list() {
    return [...records.values()].sort((left, right) => left.createdAt - right.createdAt)
  },
  async save(saved: RecipeRecord[]) {
    for (const record of saved)
      records.set(record.recipe.id, record)
  },
  async remove(ids: string[]) {
    for (const id of ids)
      records.delete(id)
  },
  async clear() {
    records.clear()
  },
}
