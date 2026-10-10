import type { Recipe } from '@proj-airi/core-agent'

import { isAutoRunRecipe, usableRecipes } from '@proj-airi/core-agent'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export type { DecisionAction, Recipe } from '@proj-airi/core-agent'

/** The fields that the owner writes in the recipe editor. */
export type RecipeFields = Pick<Recipe, 'name' | 'description' | 'instructions' | 'decision' | 'keywords' | 'automation' | 'modelTimed' | 'background'>

/**
 * Recipes the owner keeps: the owner's own and model proposals.
 *
 * Use when:
 * - A run decides which recipes it can use, or Settings > Memory lists them.
 *
 * Expects:
 * - Only the owner approves a recipe. A model proposal stays unapproved until then.
 *
 * Returns:
 * - All recipes, the usable ones, and actions that change them.
 */
export const useRecipesStore = defineStore('recipes', () => {
  const recipes = useLocalStorageManualReset<Recipe[]>('recipes/custom', [])
  /** Whether the character can propose recipes in conversation. Every proposal still waits for approval. */
  const proposalsEnabled = useLocalStorageManualReset<boolean>('recipes/proposals-enabled', true)

  const usable = computed(() => usableRecipes(recipes.value))
  /** Recipes that a conversation uses: no automation, with or without keywords. */
  const conversation = computed(() => recipes.value.filter(recipe => !isAutoRunRecipe(recipe)))
  /** Recipes that start on their own: on the owner's automation, or on one that the model sets. Each start costs a model call. */
  const autoRun = computed(() => recipes.value.filter(isAutoRunRecipe))

  function setEnabled(id: string, enabled: boolean) {
    recipes.value = recipes.value.map(recipe => recipe.id === id ? { ...recipe, enabled } : recipe)
  }

  /** The owner's one-time authorization. Later uses need no prompt. */
  function approve(id: string) {
    recipes.value = recipes.value.map(recipe => recipe.id === id ? { ...recipe, approved: true } : recipe)
  }

  /** Adds an owner recipe. The owner wrote it, so it starts approved. */
  function add(recipe: Omit<Recipe, 'id' | 'source' | 'approved'>) {
    recipes.value = [...recipes.value, { ...recipe, id: `user:${nanoid()}`, source: 'user', approved: true }]
  }

  /** Stores a model proposal. It waits unapproved and disabled until the owner reviews it. */
  function propose(recipe: Omit<Recipe, 'id' | 'source' | 'approved' | 'enabled'>) {
    const proposal: Recipe = { ...recipe, id: `model:${nanoid()}`, source: 'model', approved: false, enabled: false }
    recipes.value = [...recipes.value, proposal]
    return proposal
  }

  /**
   * Changes what a recipe does. Its source, switch, and approval stay.
   */
  function update(id: string, fields: RecipeFields) {
    recipes.value = recipes.value.map(recipe => recipe.id === id ? { ...recipe, ...fields } : recipe)
  }

  function remove(id: string) {
    recipes.value = recipes.value.filter(recipe => recipe.id !== id)
  }

  function resetState() {
    recipes.reset()
    proposalsEnabled.reset()
  }

  return {
    recipes,
    usable,
    proposalsEnabled,
    conversation,
    autoRun,
    setEnabled,
    approve,
    add,
    propose,
    update,
    remove,
    resetState,
  }
})
