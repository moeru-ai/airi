import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useRecipesStore } from '@proj-airi/stage-ui/stores/recipes'

/** The marker of a recipe's row. The page and its module share it. */
export function recipeSearchKey(id: string) {
  return settingsSearchItemKey('recipe', id)
}

/** The recipes page, with the recipes by name. */
export default {
  routes: [{
    path: '/settings/modules/memory-long-term-recipes',
    items: () => useRecipesStore().recipes.map(recipe => ({ title: recipe.name, key: recipeSearchKey(recipe.id) })),
  }],
} satisfies SettingsSearchModule
