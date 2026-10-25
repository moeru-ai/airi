import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useRecipesStore } from '@proj-airi/stage-ui/stores/recipes'

/** The marker of a recipe's row. The page and the provider share it. */
export function recipeSearchKey(id: string) {
  return settingsSearchItemKey('recipe', id)
}

/** Lists the recipes by name. */
const provideRecipes: SettingsSearchProvider = () =>
  useRecipesStore().recipes.map(recipe => ({ title: recipe.name, key: recipeSearchKey(recipe.id) }))

export default provideRecipes
