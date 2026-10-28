<script setup lang="ts">
import type { Recipe, RecipeFields } from '@proj-airi/stage-ui/stores/recipes'

import { MODEL_DECIDES_STEPS } from '@proj-airi/core-agent'
import { WIP } from '@proj-airi/stage-ui/components'
import { useRecipesStore } from '@proj-airi/stage-ui/stores/recipes'
import { SKILL_ICONS } from '@proj-airi/stage-ui/tools/icons'
import { Button, Checkbox, FieldCheckbox, GhostButton, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import RecipeEditor from './components/recipe-editor.vue'

import { recipeSearchKey } from './memory-long-term-recipes.search'

/** Recipe types that the owner can write. */
type RecipeType = 'instructions' | 'decision'
/** Conversation recipes work inside a reply. Auto-run recipes are still in development, so their tab shows a banner. */
type RecipeTab = 'conversation' | 'auto-run'

const { t } = useI18n()
const recipesStore = useRecipesStore()
const { recipes, proposalsEnabled } = storeToRefs(recipesStore)

const KEY = 'settings.pages.modules.memory-long-term.recipes'
const addableTypes: RecipeType[] = ['instructions', 'decision']
const KEYWORDS_SHOWN = 3

const TYPE_ICONS: Record<RecipeType, string> = SKILL_ICONS

const tab = ref<RecipeTab>('conversation')
const isAutoRunTab = computed(() => tab.value === 'auto-run')
/** Recipes that a decision answer can lead to: one with steps, or another decision. */
const targets = computed(() => recipes.value.filter(recipe => recipe.instructions.trim() || recipe.decision))
const tabOptions = computed(() => [
  { label: `${t(`${KEY}.tabs.conversation`)} · ${recipes.value.length}`, value: 'conversation' as const, icon: 'i-solar:chat-round-dots-linear' },
  { label: t(`${KEY}.tabs.auto_run`), value: 'auto-run' as const, icon: 'i-solar:alarm-linear' },
])

// One form is open at a time: the type picker, a new recipe, or one recipe in edit.
const adding = ref<RecipeType | 'choosing' | undefined>()
const editingId = ref<string>()

function closeForms() {
  adding.value = undefined
  editingId.value = undefined
}

function selectTab(value: RecipeTab) {
  tab.value = value
  closeForms()
}

function startAdding() {
  editingId.value = undefined
  adding.value = 'choosing'
}

function startEditing(id: string) {
  adding.value = undefined
  editingId.value = id
}

function typeOf(recipe: Recipe): RecipeType {
  return recipe.decision ? 'decision' : 'instructions'
}

function descriptionOf(recipe: Recipe) {
  return recipe.description || recipe.decision?.question.instructions || ''
}

/** One line of facts: type, source, and what the recipe can do. */
function metaOf(recipe: Recipe) {
  // A recipe whose runs the model decides has preset instructions, so its grants say what it is instead of a style.
  const style = recipe.instructions === MODEL_DECIDES_STEPS ? [] : [t(`${KEY}.styles.${typeOf(recipe)}`)]
  return [...style, t(`${KEY}.sources.${recipe.source}`), ...grantsOf(recipe)].join(' · ')
}

/** What an approval lets the recipe do: run in the background, and what invokes it. */
function grantsOf(recipe: Recipe) {
  const parts: string[] = []
  if (recipe.background)
    parts.push(t(`${KEY}.background.tag`))
  if (recipe.instructions === MODEL_DECIDES_STEPS)
    parts.push(t(`${KEY}.model_flow`))
  if (recipe.keywords.length) {
    const extra = recipe.keywords.length - KEYWORDS_SHOWN
    parts.push(t(`${KEY}.keywords_summary`, { words: recipe.keywords.slice(0, KEYWORDS_SHOWN).join(', ') }) + (extra > 0 ? ` +${extra}` : ''))
  }
  return parts
}

function addRecipe(fields: RecipeFields) {
  recipesStore.add({ ...fields, enabled: true })
  closeForms()
}

function saveRecipe(id: string, fields: RecipeFields) {
  recipesStore.update(id, fields)
  closeForms()
}

function removeRecipe(id: string) {
  recipesStore.remove(id)
  closeForms()
}
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <SelectTab :model-value="tab" :options="tabOptions" size="sm" @update:model-value="selectTab" />

    <template v-if="isAutoRunTab">
      <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.tabs.auto_run_description`) }}
      </p>
      <WIP />
    </template>

    <template v-else>
      <FieldCheckbox
        v-model="proposalsEnabled"
        :label="t(`${KEY}.proposals.label`)"
        :description="t(`${KEY}.proposals.description`)"
      />

      <div :class="['flex flex-wrap items-start justify-between', 'gap-3']">
        <p :class="['min-w-0 flex-1', 'text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t(`${KEY}.tabs.conversation_description`) }}
        </p>
        <!-- The hover outline grows 4px past the button, so the button keeps that space inside the page edge. -->
        <Button v-if="!adding" :class="['m-1']" size="sm" variant="primary" icon="i-solar:add-circle-linear" :label="t(`${KEY}.add_button`)" @click="startAdding" />
      </div>

      <!-- Add flow: choose a type, then fill in its fields. -->
      <section v-if="adding === 'choosing'" :class="['flex flex-col', 'gap-3', 'rounded-xl', 'bg-neutral-50 dark:bg-neutral-800/60', 'p-4']">
        <span :class="['text-sm font-medium']">{{ t(`${KEY}.types.title`) }}</span>
        <div :class="['grid grid-cols-1 sm:grid-cols-2', 'gap-3']">
          <button
            v-for="type in addableTypes"
            :key="type"
            type="button"
            :class="[
              'flex items-start', 'gap-3', 'text-left',
              'rounded-xl', 'p-3',
              'bg-white dark:bg-neutral-900/60',
              'border-2 border-transparent', 'transition-colors duration-200',
              'hover:border-primary-300 dark:hover:border-primary-500/60',
              'outline-none focus-visible:border-primary-400',
            ]"
            @click="adding = type"
          >
            <span :class="[TYPE_ICONS[type], 'shrink-0 text-xl', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
            <span :class="['flex flex-col', 'gap-0.5']">
              <span :class="['text-sm font-medium']">{{ t(`${KEY}.types.${type}.title`) }}</span>
              <span :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">{{ t(`${KEY}.types.${type}.description`) }}</span>
            </span>
          </button>
        </div>
        <div :class="['flex justify-end']">
          <Button size="sm" :label="t(`${KEY}.cancel`)" @click="closeForms" />
        </div>
      </section>

      <section v-else-if="adding" :class="['flex flex-col', 'gap-4', 'rounded-xl', 'bg-neutral-50 dark:bg-neutral-800/60', 'p-4']">
        <span :class="['flex items-center', 'gap-2', 'text-sm font-medium']">
          <span :class="[TYPE_ICONS[adding], 'text-lg', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
          {{ t(`${KEY}.types.${adding}.title`) }}
        </span>
        <RecipeEditor :type="adding" :targets="targets" @save="addRecipe" @cancel="closeForms" />
      </section>

      <ul v-if="recipes.length" :class="['flex flex-col', 'gap-2']">
        <li
          v-for="recipe in recipes"
          :key="recipe.id"
          :data-settings-search="recipeSearchKey(recipe.id)"
          :class="[
            'flex flex-col', 'gap-3',
            'rounded-xl', 'px-4 py-3',
            'bg-neutral-50 dark:bg-neutral-800/60',
            'border-2', editingId === recipe.id ? 'border-primary-300 dark:border-primary-500/60' : 'border-transparent',
            'transition-colors duration-200',
          ]"
        >
          <div :class="['flex items-center', 'gap-3']">
            <span
              :class="[
                'size-9 shrink-0', 'rounded-lg', 'flex items-center justify-center',
                'bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-300',
              ]"
              aria-hidden="true"
            >
              <span :class="[TYPE_ICONS[typeOf(recipe)], 'text-lg']" />
            </span>
            <div :class="['min-w-0 flex-1', 'flex flex-col']">
              <span :class="['truncate', 'text-sm font-medium']">{{ recipe.name }}</span>
              <span :class="['truncate', 'text-xs', 'text-neutral-400 dark:text-neutral-500']">{{ metaOf(recipe) }}</span>
              <span v-if="descriptionOf(recipe)" :class="['truncate', 'text-xs', 'text-neutral-500 dark:text-neutral-400']" :title="descriptionOf(recipe)">
                {{ descriptionOf(recipe) }}
              </span>
            </div>
            <template v-if="editingId !== recipe.id">
              <GhostButton size="sm" icon="i-solar:pen-2-linear" :aria-label="t(`${KEY}.edit`)" :title="t(`${KEY}.edit`)" @click="startEditing(recipe.id)" />
              <GhostButton size="sm" icon="i-solar:trash-bin-minimalistic-linear" :aria-label="t(`${KEY}.remove`)" :title="t(`${KEY}.remove`)" @click="removeRecipe(recipe.id)" />
            </template>
            <Checkbox
              :model-value="recipe.enabled"
              :disabled="!recipe.approved"
              :aria-label="t(`${KEY}.enabled`, { name: recipe.name })"
              @update:model-value="value => recipesStore.setEnabled(recipe.id, value)"
            />
          </div>

          <div v-if="!recipe.approved" :class="['flex flex-wrap items-center', 'gap-3', 'text-xs', 'text-neutral-500 dark:text-neutral-400']">
            <span :class="['i-solar:shield-check-linear', 'shrink-0 text-base']" aria-hidden="true" />
            <span :class="['min-w-0 flex-1', 'flex flex-col', 'gap-0.5']">
              <span>{{ t(`${KEY}.pending`) }}</span>
              <span v-if="grantsOf(recipe).length">{{ t(`${KEY}.grants`, { what: grantsOf(recipe).join(' · ') }) }}</span>
            </span>
            <Button size="sm" variant="primary" :label="t(`${KEY}.approve`)" @click="recipesStore.approve(recipe.id)" />
          </div>

          <div v-if="editingId === recipe.id" :class="['rounded-xl', 'bg-white dark:bg-neutral-900/60', 'p-4']">
            <RecipeEditor
              :type="typeOf(recipe)"
              :recipe="recipe"
              :targets="targets"
              @save="fields => saveRecipe(recipe.id, fields)"
              @cancel="closeForms"
            />
          </div>
        </li>
      </ul>
      <p v-else-if="!adding" :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.empty`) }}
      </p>
    </template>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-long-term.recipes.title
  subtitleKey: settings.pages.modules.memory-long-term.title
  stageTransition:
    name: slide
</route>
