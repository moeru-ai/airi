<script setup lang="ts">
import type { Recipe } from '@proj-airi/stage-ui/stores/recipes'

import { useRecipesStore } from '@proj-airi/stage-ui/stores/recipes'
import { Button, Checkbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import RecipeEditor from './components/recipe-editor.vue'

const { t } = useI18n()
const recipesStore = useRecipesStore()
const { recipes } = storeToRefs(recipesStore)

/** Recipe types that the owner can write. */
type EditableRecipeType = Extract<Recipe['style']['kind'], 'instructions' | 'decision'>

const KEY = 'settings.pages.modules.memory-long-term.recipes'
const addableTypes: EditableRecipeType[] = ['instructions', 'decision']

const STYLE_ICONS: Record<Recipe['style']['kind'], string> = {
  instructions: 'i-solar:document-text-bold-duotone',
  decision: 'i-solar:branching-paths-up-bold-duotone',
  run: 'i-solar:rocket-2-bold-duotone',
  mcp: 'i-solar:plug-circle-bold-duotone',
}

// One form is open at a time: the type picker, a new recipe, or one recipe in edit.
const adding = ref<EditableRecipeType | 'choosing' | undefined>()
const editingId = ref<string>()

function startAdding() {
  editingId.value = undefined
  adding.value = 'choosing'
}

function startEditing(id: string) {
  adding.value = undefined
  editingId.value = id
}

function closeForms() {
  adding.value = undefined
  editingId.value = undefined
}

/** Built-in recipes keep their definition in code, so their text comes from the locale. */
function nameOf(recipe: Recipe) {
  return recipe.source === 'builtin' ? t(`${KEY}.builtin.${recipe.id.replace('builtin:', '')}.name`) : recipe.name
}

function descriptionOf(recipe: Recipe) {
  if (recipe.source === 'builtin')
    return t(`${KEY}.builtin.${recipe.id.replace('builtin:', '')}.description`)
  if (recipe.description)
    return recipe.description
  return recipe.style.kind === 'decision' ? recipe.style.question.instructions : ''
}

function keywordsOf(recipe: Recipe) {
  return recipe.triggers.flatMap(trigger => trigger.kind === 'keyword' ? trigger.keywords : [])
}

/** Only owner and model recipes in the styles that the form writes can change. */
function editableType(recipe: Recipe): EditableRecipeType | undefined {
  if (recipe.source === 'builtin')
    return undefined
  return recipe.style.kind === 'instructions' || recipe.style.kind === 'decision' ? recipe.style.kind : undefined
}

function addRecipe(fields: Pick<Recipe, 'name' | 'description' | 'style' | 'triggers'>) {
  recipesStore.add({ ...fields, enabled: true })
  closeForms()
}

function saveRecipe(id: string, fields: Pick<Recipe, 'name' | 'description' | 'style' | 'triggers'>) {
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
    <section :class="['rounded-xl', 'bg-neutral-50 dark:bg-neutral-800/60', 'p-5', 'flex flex-col', 'gap-4']">
      <div :class="['flex flex-wrap items-start justify-between', 'gap-3']">
        <p :class="['min-w-0 flex-1', 'text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t(`${KEY}.description`) }}
        </p>
        <Button v-if="!adding" size="sm" variant="primary" icon="i-solar:add-circle-linear" :label="t(`${KEY}.add_button`)" @click="startAdding" />
      </div>

      <!-- Add flow: choose a type, then fill in its fields. -->
      <div v-if="adding === 'choosing'" :class="['flex flex-col', 'gap-3']">
        <span :class="['text-sm font-medium']">{{ t(`${KEY}.types.title`) }}</span>
        <div :class="['grid grid-cols-1 sm:grid-cols-2', 'gap-3']">
          <button
            v-for="type in addableTypes"
            :key="type"
            type="button"
            :class="[
              'flex items-start', 'gap-3', 'text-left',
              'rounded-xl', 'p-4',
              'bg-white dark:bg-neutral-900/60',
              'border-2 border-transparent', 'transition-colors duration-200',
              'hover:border-primary-300 dark:hover:border-primary-500/60',
              'outline-none focus-visible:border-primary-400',
            ]"
            @click="adding = type"
          >
            <span :class="[STYLE_ICONS[type], 'shrink-0 text-2xl', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
            <span :class="['flex flex-col', 'gap-1']">
              <span :class="['text-sm font-medium']">{{ t(`${KEY}.types.${type}.title`) }}</span>
              <span :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">{{ t(`${KEY}.types.${type}.description`) }}</span>
            </span>
          </button>
        </div>
        <div :class="['flex justify-end']">
          <Button size="sm" :label="t(`${KEY}.cancel`)" @click="closeForms" />
        </div>
      </div>

      <div v-else-if="adding" :class="['flex flex-col', 'gap-4', 'rounded-xl', 'bg-white dark:bg-neutral-900/60', 'p-4']">
        <span :class="['flex items-center', 'gap-2', 'text-sm font-medium']">
          <span :class="[STYLE_ICONS[adding], 'text-lg', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
          {{ t(`${KEY}.types.${adding}.title`) }}
        </span>
        <RecipeEditor :type="adding" :targets="recipes" @save="addRecipe" @cancel="closeForms" />
      </div>
    </section>

    <ul v-if="recipes.length" :class="['flex flex-col', 'gap-3']">
      <li
        v-for="recipe in recipes"
        :key="recipe.id"
        :class="[
          'flex flex-col', 'gap-3',
          'rounded-xl', 'p-4',
          'bg-neutral-50 dark:bg-neutral-800/60',
          'border-2', editingId === recipe.id ? 'border-primary-300 dark:border-primary-500/60' : 'border-transparent',
          'transition-colors duration-200',
        ]"
      >
        <div :class="['flex items-start', 'gap-3']">
          <span
            :class="[
              'size-10 shrink-0', 'rounded-lg', 'flex items-center justify-center',
              'bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-300',
            ]"
            aria-hidden="true"
          >
            <span :class="[STYLE_ICONS[recipe.style.kind], 'text-xl']" />
          </span>
          <div :class="['min-w-0 flex-1', 'flex flex-col', 'gap-1']">
            <div :class="['flex flex-wrap items-center', 'gap-x-2 gap-y-1']">
              <span :class="['font-medium', 'break-words']">{{ nameOf(recipe) }}</span>
              <span :class="['rounded-full', 'px-2 py-0.5', 'text-xs', 'bg-neutral-200/70 text-neutral-600 dark:bg-neutral-700/70 dark:text-neutral-300']">
                {{ t(`${KEY}.styles.${recipe.style.kind}`) }}
              </span>
              <span :class="['text-xs', 'text-neutral-400 dark:text-neutral-500']">
                {{ t(`${KEY}.sources.${recipe.source}`) }}
              </span>
            </div>
            <p v-if="descriptionOf(recipe)" :class="['text-sm', 'text-neutral-500 dark:text-neutral-400', 'line-clamp-2']">
              {{ descriptionOf(recipe) }}
            </p>
            <div v-if="keywordsOf(recipe).length" :class="['flex flex-wrap', 'gap-1.5', 'pt-1']">
              <span
                v-for="keyword in keywordsOf(recipe)"
                :key="keyword"
                :class="['inline-flex items-center', 'gap-1', 'rounded-full', 'px-2 py-0.5', 'text-xs', 'bg-primary-100/70 text-primary-700 dark:bg-primary-900/50 dark:text-primary-200']"
              >
                <span :class="['i-solar:hashtag-linear']" aria-hidden="true" />
                {{ keyword }}
              </span>
            </div>
          </div>
          <Checkbox
            :model-value="recipe.enabled"
            :disabled="!recipe.approved"
            :aria-label="t(`${KEY}.enabled`, { name: nameOf(recipe) })"
            @update:model-value="value => recipesStore.setEnabled(recipe.id, value)"
          />
        </div>

        <div
          v-if="!recipe.approved"
          :class="[
            'flex flex-wrap items-center', 'gap-3',
            'rounded-lg', 'px-3 py-2.5',
            'bg-amber-50 text-amber-800 dark:bg-amber-900/25 dark:text-amber-200',
          ]"
        >
          <span :class="['i-solar:shield-check-linear', 'shrink-0 text-lg']" aria-hidden="true" />
          <span :class="['min-w-0 flex-1', 'text-sm']">{{ t(`${KEY}.pending`) }}</span>
          <Button size="sm" variant="primary" :label="t(`${KEY}.approve`)" @click="recipesStore.approve(recipe.id)" />
        </div>

        <div v-if="editingId === recipe.id && editableType(recipe)" :class="['rounded-xl', 'bg-white dark:bg-neutral-900/60', 'p-4']">
          <RecipeEditor :type="editableType(recipe)!" :recipe="recipe" :targets="recipes" @save="fields => saveRecipe(recipe.id, fields)" @cancel="closeForms" />
        </div>
        <div v-else-if="recipe.source !== 'builtin'" :class="['flex flex-wrap justify-end', 'gap-2']">
          <Button v-if="editableType(recipe)" size="sm" icon="i-solar:pen-2-linear" :label="t(`${KEY}.edit`)" @click="startEditing(recipe.id)" />
          <Button size="sm" color="red" icon="i-solar:trash-bin-minimalistic-linear" :label="t(`${KEY}.remove`)" @click="removeRecipe(recipe.id)" />
        </div>
      </li>
    </ul>
    <p v-else :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
      {{ t(`${KEY}.empty`) }}
    </p>
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
