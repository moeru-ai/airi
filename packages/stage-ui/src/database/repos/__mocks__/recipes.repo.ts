import type { Recipe } from '@proj-airi/core-agent'

import type { RecipeRecord } from '../recipes.repo'

/** In-memory recipes for Node tests, which have no IndexedDB. */
const records = new Map<string, RecipeRecord>()

export const recipesRepo = {
  async list() {
    return [...records.values()].sort((left, right) => left.order - right.order)
  },
  async add(recipes: Recipe[], createdAt: number) {
    const last = Math.max(0, ...[...records.values()].map(record => record.order))
    recipes.forEach((recipe, index) => records.set(recipe.id, { id: recipe.id, recipe, order: last + 1 + index, createdAt, updatedAt: createdAt }))
  },
  async change(id: string, fields: Partial<Recipe>, updatedAt: number) {
    const stored = records.get(id)
    if (!stored)
      return false
    records.set(id, { ...stored, recipe: { ...stored.recipe, ...fields }, updatedAt })
    return true
  },
  async remove(ids: string[]) {
    for (const id of ids)
      records.delete(id)
  },
  async clear() {
    records.clear()
  },
}
