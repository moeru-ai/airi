<script setup lang="ts">
import type { DecisionAction, Recipe } from '@proj-airi/stage-ui/stores/recipes'

import { useRecipesStore } from '@proj-airi/stage-ui/stores/recipes'
import { Button, FieldCheckbox, FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/** Recipe types that the add flow offers. Each one runs once it is added. */
type AddableType = 'instructions' | 'decision'
type QuestionType = 'noul' | 'choice' | 'score'
type ActionKind = DecisionAction['kind']

/** One answer row of a decision recipe and the action it leads to. */
interface AnswerRow {
  meaning: string
  action: ActionKind
  hint: string
  recipeId: string
}

const { t } = useI18n()
const recipesStore = useRecipesStore()
const { recipes } = storeToRefs(recipesStore)

const KEY = 'settings.pages.modules.memory-long-term.recipes'
const addableTypes: AddableType[] = ['instructions', 'decision']

// The add flow first picks a type, then shows that type's fields.
const adding = ref<AddableType | 'choosing' | undefined>()
const name = ref('')
const description = ref('')
const instructions = ref('')
const keywords = ref('')
const question = ref('')
const questionType = ref<QuestionType>('noul')
const answers = ref<AnswerRow[]>([])

function emptyRow(): AnswerRow {
  return { meaning: '', action: 'reply', hint: '', recipeId: '' }
}

// Yes or no has two fixed answers. Choices and levels start with two and can grow.
watch(questionType, () => {
  answers.value = [emptyRow(), emptyRow()]
}, { immediate: true })

const questionTypeOptions = computed(() => (['noul', 'choice', 'score'] as const).map(type => ({ label: t(`${KEY}.decision.type.${type}`), value: type })))
const actionOptions = computed(() => [
  { label: t(`${KEY}.decision.action.reply`), value: 'reply' },
  { label: t(`${KEY}.decision.action.stay_quiet`), value: 'stay-quiet' },
  { label: t(`${KEY}.decision.action.hint`), value: 'hint' },
  { label: t(`${KEY}.decision.action.recipe`), value: 'recipe' },
])
const recipeOptions = computed(() => recipes.value.map(recipe => ({ label: recipe.name, value: recipe.id })))

function answerLabel(index: number) {
  if (questionType.value === 'noul')
    return t(index === 0 ? `${KEY}.decision.yes_means` : `${KEY}.decision.no_means`)
  return t(questionType.value === 'choice' ? `${KEY}.decision.option` : `${KEY}.decision.level`)
}

/** Answer keys follow the classifier: true and false, option names, or level indexes. */
function answerKey(index: number) {
  if (questionType.value === 'noul')
    return index === 0 ? 'true' : 'false'
  return questionType.value === 'choice' ? `option_${index + 1}` : String(index)
}

function rowAction(row: AnswerRow): DecisionAction {
  switch (row.action) {
    case 'hint':
      return { kind: 'hint', text: row.hint.trim() }
    case 'recipe':
      return { kind: 'recipe', recipeId: row.recipeId }
    case 'stay-quiet':
      return { kind: 'stay-quiet' }
    default:
      return { kind: 'reply' }
  }
}

function decisionStyle(): Recipe['style'] {
  const rows = answers.value
  const instructionsText = question.value.trim()
  const questionShape = questionType.value === 'noul'
    ? { type: 'noul' as const, instructions: instructionsText, criteria: { true: rows[0]!.meaning.trim(), false: rows[1]!.meaning.trim() } }
    : questionType.value === 'choice'
      ? { type: 'choice' as const, instructions: instructionsText, criteria: Object.fromEntries(rows.map((row, index) => [answerKey(index), row.meaning.trim()])) }
      : { type: 'score' as const, instructions: instructionsText, criteria: rows.map(row => row.meaning.trim()) }
  return { kind: 'decision', question: questionShape, actions: Object.fromEntries(rows.map((row, index) => [answerKey(index), rowAction(row)])) }
}

function resetForm() {
  adding.value = undefined
  name.value = ''
  description.value = ''
  instructions.value = ''
  keywords.value = ''
  question.value = ''
  questionType.value = 'noul'
  answers.value = [emptyRow(), emptyRow()]
}

const canSubmit = computed(() => {
  if (!name.value.trim())
    return false
  if (adding.value === 'instructions')
    return Boolean(instructions.value.trim())
  return Boolean(question.value.trim())
    && answers.value.every(row => row.meaning.trim() && (row.action !== 'hint' || row.hint.trim()) && (row.action !== 'recipe' || row.recipeId))
})

function submit() {
  if (!canSubmit.value)
    return
  const words = keywords.value.split(/[,，]/).map(word => word.trim()).filter(Boolean)
  recipesStore.add({
    name: name.value.trim(),
    description: description.value.trim(),
    style: adding.value === 'instructions' ? { kind: 'instructions', instructions: instructions.value.trim() } : decisionStyle(),
    triggers: adding.value === 'instructions' && words.length ? [{ kind: 'keyword', keywords: words }] : [],
    enabled: true,
  })
  resetForm()
}
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
      <div :class="['flex flex-wrap items-start justify-between', 'gap-3']">
        <div :class="['flex flex-col', 'gap-1', 'min-w-0 flex-1']">
          <h2 :class="['text-lg font-medium']">
            {{ t(`${KEY}.title`) }}
          </h2>
          <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
            {{ t(`${KEY}.description`) }}
          </p>
        </div>
        <Button v-if="!adding" size="sm" variant="primary" icon="i-solar:add-circle-linear" :label="t(`${KEY}.add_button`)" @click="adding = 'choosing'" />
      </div>

      <!-- Add flow: choose a type, then fill in its fields. -->
      <div v-if="adding === 'choosing'" :class="['flex flex-col', 'gap-3']">
        <span :class="['text-sm font-medium']">{{ t(`${KEY}.types.title`) }}</span>
        <div :class="['grid grid-cols-1 sm:grid-cols-2', 'gap-3']">
          <button
            v-for="type in addableTypes"
            :key="type"
            type="button"
            :class="['flex flex-col', 'gap-1', 'text-left', 'rounded-md', 'border border-neutral-200 dark:border-neutral-700', 'p-3', 'transition-colors', 'hover:border-primary-400 dark:hover:border-primary-500', 'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60']"
            @click="adding = type"
          >
            <span :class="['text-sm font-medium']">{{ t(`${KEY}.types.${type}.title`) }}</span>
            <span :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">{{ t(`${KEY}.types.${type}.description`) }}</span>
          </button>
        </div>
        <div>
          <Button size="sm" :label="t(`${KEY}.cancel`)" @click="resetForm" />
        </div>
      </div>

      <div v-else-if="adding" :class="['flex flex-col', 'gap-3', 'rounded-md', 'border border-neutral-200 dark:border-neutral-700', 'p-3']">
        <span :class="['text-sm font-medium']">{{ t(`${KEY}.types.${adding}.title`) }}</span>
        <FieldInput v-model="name" :label="t(`${KEY}.add.name`)" />
        <FieldInput v-model="description" :label="t(`${KEY}.add.description`)" />
        <template v-if="adding === 'instructions'">
          <FieldInput v-model="instructions" :single-line="false" :label="t(`${KEY}.add.instructions`)" />
          <FieldInput v-model="keywords" :label="t(`${KEY}.add.keywords.label`)" :description="t(`${KEY}.add.keywords.description`)" />
        </template>
        <template v-else>
          <FieldInput v-model="question" :label="t(`${KEY}.decision.question`)" />
          <FieldSelect v-model="questionType" :label="t(`${KEY}.decision.type.label`)" :options="questionTypeOptions" />
          <div v-for="(row, index) in answers" :key="index" :class="['flex flex-col', 'gap-2', 'rounded-md', 'bg-neutral-100 dark:bg-neutral-900', 'p-3']">
            <FieldInput v-model="row.meaning" :label="answerLabel(index)" />
            <FieldSelect v-model="row.action" :label="t(`${KEY}.decision.action.label`)" :options="actionOptions" />
            <FieldInput v-if="row.action === 'hint'" v-model="row.hint" :label="t(`${KEY}.decision.hint_text`)" />
            <FieldSelect v-if="row.action === 'recipe'" v-model="row.recipeId" :label="t(`${KEY}.decision.target_recipe`)" :options="recipeOptions" />
            <div v-if="questionType !== 'noul' && answers.length > 2">
              <Button size="sm" :label="t(`${KEY}.decision.remove_option`)" @click="answers.splice(index, 1)" />
            </div>
          </div>
          <div v-if="questionType !== 'noul'">
            <Button size="sm" icon="i-solar:add-circle-linear" :label="t(`${KEY}.decision.add_option`)" @click="answers.push(emptyRow())" />
          </div>
          <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
            {{ t(`${KEY}.decision.note`) }}
          </p>
        </template>
        <div :class="['flex', 'gap-2']">
          <Button size="sm" variant="primary" :label="t(`${KEY}.add.submit`)" :disabled="!canSubmit" @click="submit" />
          <Button size="sm" :label="t(`${KEY}.cancel`)" @click="resetForm" />
        </div>
      </div>

      <ul v-if="recipes.length" :class="['flex flex-col', 'gap-3']">
        <li v-for="recipe in recipes" :key="recipe.id" :class="['flex flex-col', 'gap-2', 'rounded-md', 'border border-neutral-200 dark:border-neutral-700', 'p-3']">
          <FieldCheckbox
            :model-value="recipe.enabled"
            :disabled="!recipe.approved"
            :label="recipe.name"
            :description="recipe.description"
            @update:model-value="value => recipesStore.setEnabled(recipe.id, value)"
          />
          <div :class="['flex flex-wrap items-center', 'gap-2', 'text-xs', 'text-neutral-500 dark:text-neutral-400']">
            <span>{{ t(`${KEY}.sources.${recipe.source}`) }}</span>
            <span v-if="!recipe.approved">{{ t(`${KEY}.pending`) }}</span>
            <Button v-if="!recipe.approved" size="sm" variant="primary" :label="t(`${KEY}.approve`)" @click="recipesStore.approve(recipe.id)" />
            <Button v-if="recipe.source !== 'builtin'" size="sm" :label="t(`${KEY}.remove`)" @click="recipesStore.remove(recipe.id)" />
          </div>
        </li>
      </ul>
      <p v-else :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.empty`) }}
      </p>
    </section>
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
