import type { Recipe } from '@proj-airi/core-agent'

import type { RecipeRecord } from '../database/repos/recipes.repo'

import { errorMessageFrom } from '@moeru/std'
import { usableRecipes } from '@proj-airi/core-agent'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useBroadcastChannel } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { recipesRepo } from '../database/repos/recipes.repo'

export type { DecisionAction, Recipe } from '@proj-airi/core-agent'

/** The fields that the owner writes in the recipe editor. */
export type RecipeFields = Pick<Recipe, 'name' | 'description' | 'instructions' | 'decision' | 'keywords' | 'background'>

const LEGACY_RECIPES_STORAGE_KEY = 'recipes/custom'

// NOTICE:
// Up to v0.13.1 the recipes were in localStorage under `recipes/custom`, as one list.
// localStorage holds a few megabytes, and each change wrote the whole list. IndexedDB keeps one record for each recipe now.
// Move them once with their ids, in their order. The list had no times, so the move time is their creation time.
// The lock keeps two windows that start together from moving them twice.
// Removal condition: two releases after the release that moves them.
async function moveLegacyRecipes() {
  if (!globalThis.localStorage?.getItem(LEGACY_RECIPES_STORAGE_KEY))
    return
  await navigator.locks.request('airi:recipes-move', async () => {
    const stored = localStorage.getItem(LEGACY_RECIPES_STORAGE_KEY)
    if (!stored)
      return
    const legacy: Recipe[] = JSON.parse(stored)
    await recipesRepo.add(legacy, Date.now())
    localStorage.removeItem(LEGACY_RECIPES_STORAGE_KEY)
  })
}

/**
 * Recipes the owner keeps: the owner's own and model proposals.
 * IndexedDB keeps the recipes. After each change, the other windows read them again.
 *
 * Use when:
 * - A run decides which recipes it can use, or Settings > Memory lists them.
 *
 * Expects:
 * - Only the owner approves a recipe. A model proposal stays unapproved until then.
 *
 * Returns:
 * - All recipes, the usable ones, `ready` for the first read, and actions that change them.
 */
export const useRecipesStore = defineStore('recipes', () => {
  const records = ref<RecipeRecord[]>([])
  /** Whether the character can propose recipes in conversation. Every proposal still waits for approval. */
  const proposalsEnabled = useLocalStorageManualReset<boolean>('recipes/proposals-enabled', true)
  const { data: changed, post } = useBroadcastChannel<string[], string[]>({ name: 'airi:recipes' })
  let pendingLoad = moveLegacyRecipes()
    .catch(error => console.warn('[recipes] Failed to move the recipes from localStorage:', errorMessageFrom(error)))

  const recipes = computed(() => records.value.map(record => record.recipe))
  const usable = computed(() => usableRecipes(recipes.value))

  /** Reads the recipes again, after the reads that started before. */
  function load() {
    pendingLoad = pendingLoad.catch(() => {}).then(async () => {
      records.value = await recipesRepo.list()
    })
    return pendingLoad
  }

  /**
   * Resolves after every read that started before the call, the first read and the move from localStorage included.
   * Until then, `recipes` is empty because nothing is read yet, not because the owner has no recipes.
   */
  function ready() {
    return pendingLoad.catch(() => {})
  }

  /** Reads the recipes again after a change, and tells the other windows. */
  async function publish(ids: string[]) {
    await load()
    post(ids)
  }

  /** Adds a recipe at the end of the list. */
  async function insert(recipe: Recipe) {
    await recipesRepo.add([recipe], Date.now())
    await publish([recipe.id])
  }

  /**
   * Changes some fields of one recipe on its stored record, so a change never brings back an older value of another field.
   * Its place in the list stays. A removed recipe stays removed.
   */
  async function change(id: string, fields: Partial<Recipe>) {
    if (await recipesRepo.change(id, fields, Date.now()))
      await publish([id])
  }

  async function setEnabled(id: string, enabled: boolean) {
    await change(id, { enabled })
  }

  /** The owner's one-time authorization. Later uses need no prompt. */
  async function approve(id: string) {
    await change(id, { approved: true })
  }

  /** Adds an owner recipe. The owner wrote it, so it starts approved. */
  async function add(recipe: Omit<Recipe, 'id' | 'source' | 'approved'>) {
    await insert({ ...recipe, id: `user:${nanoid()}`, source: 'user', approved: true })
  }

  /** Stores a model proposal. It waits unapproved and disabled until the owner reviews it. */
  async function propose(recipe: Omit<Recipe, 'id' | 'source' | 'approved' | 'enabled'>) {
    const proposal: Recipe = { ...recipe, id: `model:${nanoid()}`, source: 'model', approved: false, enabled: false }
    await insert(proposal)
    return proposal
  }

  /**
   * Changes what a recipe does. Its source, switch, and approval stay.
   */
  async function update(id: string, fields: RecipeFields) {
    await change(id, fields)
  }

  async function remove(id: string) {
    await recipesRepo.remove([id], Date.now())
    await publish([id])
  }

  async function resetState() {
    proposalsEnabled.reset()
    await recipesRepo.clear()
    await load()
    post([])
  }

  function reload() {
    void load().catch(error => console.warn('[recipes] Failed to read the recipes:', errorMessageFrom(error)))
  }
  watch(changed, reload)
  reload()

  return {
    recipes,
    usable,
    proposalsEnabled,
    ready,
    setEnabled,
    approve,
    add,
    propose,
    update,
    remove,
    resetState,
  }
})
