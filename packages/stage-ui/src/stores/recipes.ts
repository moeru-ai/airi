import type { Recipe } from '@proj-airi/core-agent'

import { BUILTIN_RECIPES, isAutoRunRecipe, usableRecipes } from '@proj-airi/core-agent'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export type { DecisionAction, Recipe } from '@proj-airi/core-agent'

/**
 * Recipes the owner keeps: built-in recipes with their switches, the owner's own, and model proposals.
 *
 * Use when:
 * - A run decides which recipes it may use, or Settings > Memory lists them.
 *
 * Expects:
 * - Only the owner approves a recipe. A model proposal stays unapproved until then.
 *
 * Returns:
 * - All recipes, the usable ones, and actions that change them. Built-in recipes keep their definition, and only their switch is stored.
 */
export const useRecipesStore = defineStore('recipes', () => {
  const custom = useLocalStorageManualReset<Recipe[]>('recipes/custom', [])
  const builtinEnabled = useLocalStorageManualReset<Record<string, boolean>>('recipes/builtin-enabled', {})

  const recipes = computed<Recipe[]>(() => [
    ...BUILTIN_RECIPES.map(recipe => ({ ...recipe, enabled: builtinEnabled.value[recipe.id] ?? recipe.enabled })),
    ...custom.value,
  ])
  const usable = computed(() => usableRecipes(recipes.value))
  /** Recipes that a conversation uses: no trigger, or keyword triggers only. */
  const conversation = computed(() => recipes.value.filter(recipe => !isAutoRunRecipe(recipe)))
  /** Recipes that start on their own on an idle, schedule, event, or mood trigger. Each start costs a model call. */
  const autoRun = computed(() => recipes.value.filter(isAutoRunRecipe))

  /** Whether a recipe may run now. */
  function isUsable(id: string) {
    return usable.value.some(recipe => recipe.id === id)
  }

  function setEnabled(id: string, enabled: boolean) {
    if (BUILTIN_RECIPES.some(recipe => recipe.id === id)) {
      builtinEnabled.value = { ...builtinEnabled.value, [id]: enabled }
      return
    }
    custom.value = custom.value.map(recipe => recipe.id === id ? { ...recipe, enabled } : recipe)
  }

  /** The owner's one-time authorization. Later uses need no prompt. */
  function approve(id: string) {
    custom.value = custom.value.map(recipe => recipe.id === id ? { ...recipe, approved: true } : recipe)
  }

  /** Adds an owner recipe. The owner wrote it, so it starts approved. */
  function add(recipe: Omit<Recipe, 'id' | 'source' | 'approved'>) {
    custom.value = [...custom.value, { ...recipe, id: `user:${nanoid()}`, source: 'user', approved: true }]
  }

  /** Stores a model proposal. It waits unapproved and disabled until the owner reviews it. */
  function propose(recipe: Omit<Recipe, 'id' | 'source' | 'approved' | 'enabled'>) {
    const proposal: Recipe = { ...recipe, id: `model:${nanoid()}`, source: 'model', approved: false, enabled: false }
    custom.value = [...custom.value, proposal]
    return proposal
  }

  /**
   * Changes what an owner or model recipe does. Its source, switch, and approval stay.
   * Built-in recipes keep their definition, so only their switch changes.
   */
  function update(id: string, fields: Pick<Recipe, 'name' | 'description' | 'style' | 'triggers' | 'gate'>) {
    custom.value = custom.value.map(recipe => recipe.id === id ? { ...recipe, ...fields } : recipe)
  }

  function remove(id: string) {
    custom.value = custom.value.filter(recipe => recipe.id !== id)
  }

  function resetState() {
    custom.reset()
    builtinEnabled.reset()
  }

  return {
    recipes,
    usable,
    conversation,
    autoRun,
    isUsable,
    setEnabled,
    approve,
    add,
    propose,
    update,
    remove,
    resetState,
  }
})
