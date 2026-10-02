<script setup lang="ts">
import type { Recipe } from '@proj-airi/stage-ui/stores/recipes'

import { useRecipesStore } from '@proj-airi/stage-ui/stores/recipes'
import { useSettingsTriage } from '@proj-airi/stage-ui/stores/settings/triage'
import { Button, Checkbox, FieldInput, GhostButton, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import RecipeEditor from './components/recipe-editor.vue'

import { positiveNumberModel } from '../../../libs/number-model'

/** Recipe types that the owner can write. */
type EditableRecipeType = Extract<Recipe['style']['kind'], 'instructions' | 'decision'>
/** Conversation recipes work inside a reply. Auto-run recipes start on their own and cost a model call each time. */
type RecipeTab = 'conversation' | 'auto-run'

const { t } = useI18n()
const recipesStore = useRecipesStore()
const { conversation, autoRun } = storeToRefs(recipesStore)

const KEY = 'settings.pages.modules.memory-long-term.recipes'
/** The built-in look around recipe. Its switch turns idle looks on, and the attention classifier answers each look. */
const IDLE_LOOK_ID = 'builtin:idle-look'

const { appraisalIntervalMinutes } = storeToRefs(useSettingsTriage())
const lookIntervalModel = positiveNumberModel(appraisalIntervalMinutes, { integer: true })
const addableTypes: EditableRecipeType[] = ['instructions', 'decision']
const KEYWORDS_SHOWN = 3

const STYLE_ICONS: Record<Recipe['style']['kind'], string> = {
  instructions: 'i-solar:document-text-bold-duotone',
  decision: 'i-solar:branching-paths-up-bold-duotone',
  run: 'i-solar:rocket-2-bold-duotone',
  mcp: 'i-solar:plug-circle-bold-duotone',
}
const AUTO_RUN_ICON = 'i-solar:alarm-bold-duotone'

const tab = ref<RecipeTab>('conversation')
const isAutoRunTab = computed(() => tab.value === 'auto-run')
const shown = computed(() => isAutoRunTab.value ? autoRun.value : conversation.value)
const tabOptions = computed(() => [
  { label: `${t(`${KEY}.tabs.conversation`)} · ${conversation.value.length}`, value: 'conversation' as const, icon: 'i-solar:chat-round-dots-linear' },
  { label: `${t(`${KEY}.tabs.auto_run`)} · ${autoRun.value.length}`, value: 'auto-run' as const, icon: 'i-solar:alarm-linear' },
])

// One form is open at a time: the type picker, a new recipe, or one recipe in edit.
const adding = ref<EditableRecipeType | 'choosing' | undefined>()
const editingId = ref<string>()

function closeForms() {
  adding.value = undefined
  editingId.value = undefined
}

function selectTab(value: RecipeTab) {
  tab.value = value
  closeForms()
}

/** Auto-run recipes have one type, so adding one opens its form at once. */
function startAdding() {
  editingId.value = undefined
  adding.value = isAutoRunTab.value ? 'instructions' : 'choosing'
}

function startEditing(id: string) {
  adding.value = undefined
  editingId.value = id
}

function builtinKey(recipe: Recipe) {
  return `${KEY}.builtin.${recipe.id.replace('builtin:', '')}`
}

/** Built-in recipes keep their definition in code, so their text comes from the locale. */
function nameOf(recipe: Recipe) {
  return recipe.source === 'builtin' ? t(`${builtinKey(recipe)}.name`) : recipe.name
}

function descriptionOf(recipe: Recipe) {
  if (recipe.source === 'builtin')
    return t(`${builtinKey(recipe)}.description`)
  if (recipe.description)
    return recipe.description
  return recipe.style.kind === 'decision' ? recipe.style.question.instructions : ''
}

/** One line of facts: style, source, and what starts the recipe. */
function metaOf(recipe: Recipe) {
  const parts = [t(`${KEY}.styles.${recipe.style.kind}`), t(`${KEY}.sources.${recipe.source}`)]
  for (const trigger of recipe.triggers) {
    if (trigger.kind === 'keyword' && trigger.keywords.length) {
      const extra = trigger.keywords.length - KEYWORDS_SHOWN
      parts.push(t(`${KEY}.keywords_summary`, { words: trigger.keywords.slice(0, KEYWORDS_SHOWN).join(', ') }) + (extra > 0 ? ` +${extra}` : ''))
    }
    else if (trigger.kind === 'idle') {
      parts.push(trigger.afterMinutes > 0 ? t(`${KEY}.auto_run.summary.idle`, { minutes: trigger.afterMinutes }) : t(`${KEY}.auto_run.summary.look`, { minutes: appraisalIntervalMinutes.value }))
    }
    else if (trigger.kind === 'schedule') {
      parts.push(t(`${KEY}.auto_run.summary.schedule`, { minutes: trigger.everyMinutes }))
    }
  }
  return parts.join(' · ')
}

/** Only owner and model recipes in the styles that the form writes can change. */
function editableType(recipe: Recipe): EditableRecipeType | undefined {
  if (recipe.source === 'builtin')
    return undefined
  return recipe.style.kind === 'instructions' || recipe.style.kind === 'decision' ? recipe.style.kind : undefined
}

function addRecipe(fields: Pick<Recipe, 'name' | 'description' | 'style' | 'triggers' | 'gate'>) {
  recipesStore.add({ ...fields, enabled: true })
  closeForms()
}

function saveRecipe(id: string, fields: Pick<Recipe, 'name' | 'description' | 'style' | 'triggers' | 'gate'>) {
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

    <div :class="['flex flex-wrap items-start justify-between', 'gap-3']">
      <p :class="['min-w-0 flex-1', 'text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t(isAutoRunTab ? `${KEY}.tabs.auto_run_description` : `${KEY}.tabs.conversation_description`) }}
      </p>
      <Button v-if="!adding" size="sm" variant="primary" icon="i-solar:add-circle-linear" :label="t(`${KEY}.add_button`)" @click="startAdding" />
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
          <span :class="[STYLE_ICONS[type], 'shrink-0 text-xl', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
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
        <span :class="[isAutoRunTab ? AUTO_RUN_ICON : STYLE_ICONS[adding], 'text-lg', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
        {{ isAutoRunTab ? t(`${KEY}.auto_run.title`) : t(`${KEY}.types.${adding}.title`) }}
      </span>
      <RecipeEditor :type="adding" :auto-run="isAutoRunTab" :targets="conversation" @save="addRecipe" @cancel="closeForms" />
    </section>

    <ul v-if="shown.length" :class="['flex flex-col', 'gap-2']">
      <li
        v-for="recipe in shown"
        :key="recipe.id"
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
            <span :class="[isAutoRunTab ? AUTO_RUN_ICON : STYLE_ICONS[recipe.style.kind], 'text-lg']" />
          </span>
          <div :class="['min-w-0 flex-1', 'flex flex-col']">
            <span :class="['truncate', 'text-sm font-medium']">{{ nameOf(recipe) }}</span>
            <span :class="['truncate', 'text-xs', 'text-neutral-400 dark:text-neutral-500']">{{ metaOf(recipe) }}</span>
            <span v-if="descriptionOf(recipe)" :class="['truncate', 'text-xs', 'text-neutral-500 dark:text-neutral-400']" :title="descriptionOf(recipe)">
              {{ descriptionOf(recipe) }}
            </span>
          </div>
          <template v-if="recipe.source !== 'builtin' && editingId !== recipe.id">
            <GhostButton v-if="editableType(recipe)" size="sm" icon="i-solar:pen-2-linear" :aria-label="t(`${KEY}.edit`)" :title="t(`${KEY}.edit`)" @click="startEditing(recipe.id)" />
            <GhostButton size="sm" icon="i-solar:trash-bin-minimalistic-linear" :aria-label="t(`${KEY}.remove`)" :title="t(`${KEY}.remove`)" @click="removeRecipe(recipe.id)" />
          </template>
          <Checkbox
            :model-value="recipe.enabled"
            :disabled="!recipe.approved"
            :aria-label="t(`${KEY}.enabled`, { name: nameOf(recipe) })"
            @update:model-value="value => recipesStore.setEnabled(recipe.id, value)"
          />
        </div>

        <FieldInput
          v-if="recipe.id === IDLE_LOOK_ID && recipe.enabled"
          v-model="lookIntervalModel"
          type="number"
          :label="t(`${KEY}.builtin.idle-look.interval.label`)"
          :description="t(`${KEY}.builtin.idle-look.interval.description`)"
        />

        <div
          v-if="!recipe.approved"
          :class="[
            'flex flex-wrap items-center', 'gap-3',
            'rounded-lg', 'px-3 py-2',
            'bg-amber-50 text-amber-800 dark:bg-amber-900/25 dark:text-amber-200',
          ]"
        >
          <span :class="['i-solar:shield-check-linear', 'shrink-0 text-base']" aria-hidden="true" />
          <span :class="['min-w-0 flex-1', 'text-xs']">{{ t(`${KEY}.pending`) }}</span>
          <Button size="sm" variant="primary" :label="t(`${KEY}.approve`)" @click="recipesStore.approve(recipe.id)" />
        </div>

        <div v-if="editingId === recipe.id && editableType(recipe)" :class="['rounded-xl', 'bg-white dark:bg-neutral-900/60', 'p-4']">
          <RecipeEditor
            :type="editableType(recipe)!"
            :recipe="recipe"
            :auto-run="isAutoRunTab"
            :targets="conversation"
            @save="fields => saveRecipe(recipe.id, fields)"
            @cancel="closeForms"
          />
        </div>
      </li>
    </ul>
    <p v-else-if="!adding" :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
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
