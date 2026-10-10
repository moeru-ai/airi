<script setup lang="ts">
import type { Automation, AutomationCondition, AutomationTrigger } from '@proj-airi/core-agent'
import type { Recipe, RecipeFields } from '@proj-airi/stage-ui/stores/recipes'

import { MODEL_DECIDES_STEPS } from '@proj-airi/core-agent'
import { WebSocketEventSource } from '@proj-airi/server-sdk'
import { useModuleDirectoryStore } from '@proj-airi/stage-ui/stores/mods/api/module-directory'
import { useRecipesStore } from '@proj-airi/stage-ui/stores/recipes'
import { Button, Checkbox, FieldCheckbox, GhostButton, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import RecipeEditor from './components/recipe-editor.vue'

import { weekdaysLabel } from './components/weekdays'

/** Recipe types that the owner can write. */
type RecipeType = 'instructions' | 'decision'
/** Conversation recipes work inside a reply. Auto-run recipes start on their own and cost a model call each time. */
type RecipeTab = 'conversation' | 'auto-run'

const { t, locale } = useI18n()
const recipesStore = useRecipesStore()
const { conversation, autoRun, proposalsEnabled } = storeToRefs(recipesStore)

const KEY = 'settings.pages.modules.memory-long-term.recipes'
const moduleDirectory = useModuleDirectoryStore()
/** AIRI's own windows connect to the server channel too, but they report no observations, so a module trigger never follows them. */
const hostNames = new Set<string>(Object.values(WebSocketEventSource))
/** Registered modules that a module trigger can follow, by name. A name stays the same across restarts. */
const eventSources = computed(() => [...new Set(moduleDirectory.modules.map(module => module.name))].filter(source => !hostNames.has(source)).sort())
const addableTypes: RecipeType[] = ['instructions', 'decision']
const KEYWORDS_SHOWN = 3

const TYPE_ICONS: Record<RecipeType, string> = {
  instructions: 'i-solar:document-text-bold-duotone',
  decision: 'i-solar:branching-paths-up-bold-duotone',
}
const AUTO_RUN_ICON = 'i-solar:alarm-bold-duotone'

const tab = ref<RecipeTab>('conversation')
const isAutoRunTab = computed(() => tab.value === 'auto-run')
const shown = computed(() => isAutoRunTab.value ? autoRun.value : conversation.value)
/** Recipes that a decision answer can lead to: one with steps, another decision, or one whose time the model sets. */
const targets = computed(() => [
  ...conversation.value.filter(recipe => recipe.instructions.trim() || recipe.decision),
  ...autoRun.value.filter(recipe => recipe.modelTimed),
])
const tabOptions = computed(() => [
  { label: `${t(`${KEY}.tabs.conversation`)} · ${conversation.value.length}`, value: 'conversation' as const, icon: 'i-solar:chat-round-dots-linear' },
  { label: `${t(`${KEY}.tabs.auto_run`)} · ${autoRun.value.length}`, value: 'auto-run' as const, icon: 'i-solar:alarm-linear' },
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

/** Auto-run recipes have one type, so adding one opens its form at once. */
function startAdding() {
  editingId.value = undefined
  adding.value = isAutoRunTab.value ? 'instructions' : 'choosing'
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

const SUMMARY = `${KEY}.auto_run.summary`

function sourceName(source: AutomationTrigger['source']) {
  return t(`${KEY}.auto_run.source.${source}`)
}

function triggerSummary(trigger: AutomationTrigger) {
  switch (trigger.source) {
    case 'clock':
      if (trigger.event === 'every')
        return t(`${SUMMARY}.every`, { minutes: trigger.minutes })
      return trigger.days?.length
        ? t(`${SUMMARY}.at_days`, { time: trigger.time, days: weekdaysLabel(trigger.days, locale.value) })
        : t(`${SUMMARY}.at`, { time: trigger.time })
    case 'chat':
      return trigger.event === 'message' ? t(`${SUMMARY}.message`) : t(`${SUMMARY}.idle`, { source: sourceName('chat'), minutes: trigger.minutes })
    case 'mouse':
    case 'keyboard':
      if (trigger.event === 'idle')
        return t(`${SUMMARY}.idle`, { source: sourceName(trigger.source), minutes: trigger.minutes })
      return trigger.afterIdleMinutes
        ? t(`${SUMMARY}.back`, { source: sourceName(trigger.source), minutes: trigger.afterIdleMinutes })
        : t(`${SUMMARY}.active`, { source: sourceName(trigger.source) })
    case 'module':
      return t(`${SUMMARY}.observation`, { module: trigger.module })
  }
}

function conditionSummary(condition: AutomationCondition) {
  switch (condition.kind) {
    case 'time':
      return t(`${SUMMARY}.time`, { from: condition.from, to: condition.to })
    case 'weekday':
      return t(`${SUMMARY}.weekday`, { days: weekdaysLabel(condition.days, locale.value) })
    case 'state':
      return t(`${SUMMARY}.state_${condition.state}`, { source: sourceName(condition.source), minutes: condition.minutes })
  }
}

/** Any trigger starts the recipe, so the triggers read as one choice. Each condition and the cooldown follow. */
function automationSummary(automation: Automation) {
  return [
    new Intl.ListFormat(locale.value, { type: 'disjunction' }).format(automation.triggers.map(triggerSummary)),
    ...automation.conditions.map(conditionSummary),
    ...(automation.cooldownMinutes ? [t(`${SUMMARY}.cooldown`, { minutes: automation.cooldownMinutes })] : []),
  ]
}

/** What an approval lets the recipe do: run in the background, start on its own, and what starts it. */
function grantsOf(recipe: Recipe) {
  const parts: string[] = []
  if (recipe.background)
    parts.push(t(`${KEY}.background.tag`))
  if (recipe.automation)
    parts.push(...automationSummary(recipe.automation))
  if (recipe.modelTimed)
    parts.push(t(`${SUMMARY}.model`))
  if (recipe.instructions === MODEL_DECIDES_STEPS)
    parts.push(t(`${SUMMARY}.model_flow`))
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

    <FieldCheckbox
      v-if="!isAutoRunTab"
      v-model="proposalsEnabled"
      :label="t(`${KEY}.proposals.label`)"
      :description="t(`${KEY}.proposals.description`)"
    />

    <div :class="['flex flex-wrap items-start justify-between', 'gap-3']">
      <p :class="['min-w-0 flex-1', 'text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t(isAutoRunTab ? `${KEY}.tabs.auto_run_description` : `${KEY}.tabs.conversation_description`) }}
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
        <span :class="[isAutoRunTab ? AUTO_RUN_ICON : TYPE_ICONS[adding], 'text-lg', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
        {{ isAutoRunTab ? t(`${KEY}.auto_run.title`) : t(`${KEY}.types.${adding}.title`) }}
      </span>
      <RecipeEditor :type="adding" :auto-run="isAutoRunTab" :sources="eventSources" :targets="targets" @save="addRecipe" @cancel="closeForms" />
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
            <span :class="[isAutoRunTab ? AUTO_RUN_ICON : TYPE_ICONS[typeOf(recipe)], 'text-lg']" />
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
            :auto-run="isAutoRunTab"
            :sources="eventSources"
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
