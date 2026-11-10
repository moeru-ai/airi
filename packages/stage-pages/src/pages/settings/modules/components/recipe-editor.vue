<script setup lang="ts">
import type { DecisionAction, Recipe, RecipeFields } from '@proj-airi/stage-ui/stores/recipes'

import { Button, FieldCheckbox, FieldInput, FieldSelect, FieldTextArea, FieldValues } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/** Recipe types that the owner can write. */
type RecipeType = 'instructions' | 'decision'
type QuestionType = 'noul' | 'choice'
/** What an answer row does. `reply` replies as usual, so it stores no action. */
type ActionKind = DecisionAction['kind'] | 'reply'

const props = defineProps<{
  type: RecipeType
  /** The recipe to edit. Without it, the form starts empty. */
  recipe?: Recipe
  /** Recipes that an answer can point to. */
  targets: readonly Recipe[]
}>()

const emit = defineEmits<{
  (e: 'save', fields: RecipeFields): void
  (e: 'cancel'): void
}>()

/** One answer row of a decision and the action it leads to. */
interface AnswerRow {
  meaning: string
  action: ActionKind
  hint: string
  recipeId: string
}

const { t } = useI18n()
const KEY = 'settings.pages.modules.memory-long-term.recipes'

function emptyRow(): AnswerRow {
  return { meaning: '', action: 'reply', hint: '', recipeId: '' }
}

function rowFrom(meaning: string, action: DecisionAction | undefined): AnswerRow {
  return {
    meaning,
    action: action?.kind ?? 'reply',
    hint: action?.kind === 'hint' ? action.text : '',
    recipeId: action?.kind === 'recipe' ? action.recipeId : '',
  }
}

/** Reads the answer rows of a stored decision. Choices keep their order. */
function rowsFrom(decision: NonNullable<Recipe['decision']>): AnswerRow[] {
  const { question, actions } = decision
  if (question.type === 'noul')
    return [rowFrom(question.criteria.true, actions.true), rowFrom(question.criteria.false, actions.false)]
  return Object.entries(question.criteria).map(([key, meaning]) => rowFrom(meaning, actions[key]))
}

const decision = props.recipe?.decision

const name = ref(props.recipe?.name ?? '')
const description = ref(props.recipe?.description ?? '')
const instructions = ref(props.recipe?.instructions ?? '')
/** One keyword per row. A form without keywords starts with one empty row. */
const keywords = ref<string[]>(props.recipe?.keywords.length ? [...props.recipe.keywords] : [''])
const background = ref(props.recipe?.background ?? false)
const question = ref(decision?.question.instructions ?? '')
const questionType = ref<QuestionType>(decision?.question.type ?? 'noul')
const answers = ref<AnswerRow[]>(decision ? rowsFrom(decision) : [emptyRow(), emptyRow()])

/** Yes or no has two fixed answers. Choices and levels start with two and can grow. */
function setQuestionType(type: QuestionType) {
  questionType.value = type
  answers.value = [emptyRow(), emptyRow()]
}

const words = computed(() => keywords.value.map(word => word.trim()).filter(Boolean))

const questionTypeOptions = computed(() => (['noul', 'choice'] as const).map(type => ({ label: t(`${KEY}.decision.type.${type}`), value: type })))
const actionOptions = computed(() => [
  { label: t(`${KEY}.decision.action.reply`), value: 'reply' },
  { label: t(`${KEY}.decision.action.stay_quiet`), value: 'stay-quiet' },
  { label: t(`${KEY}.decision.action.hint`), value: 'hint' },
  { label: t(`${KEY}.decision.action.recipe`), value: 'recipe' },
])
const recipeOptions = computed(() => props.targets.filter(target => target.id !== props.recipe?.id).map(target => ({ label: target.name, value: target.id })))

function answerLabel(index: number) {
  if (questionType.value === 'noul')
    return t(index === 0 ? `${KEY}.decision.yes_means` : `${KEY}.decision.no_means`)
  return t(`${KEY}.decision.option`)
}

/** Answer keys are true and false, or option names. */
function answerKey(index: number) {
  if (questionType.value === 'noul')
    return index === 0 ? 'true' : 'false'
  return `option_${index + 1}`
}

/** The action of an answer row. A row that replies as usual has none. */
function rowAction(row: AnswerRow): DecisionAction | undefined {
  switch (row.action) {
    case 'hint':
      return { kind: 'hint', text: row.hint.trim() }
    case 'recipe':
      return { kind: 'recipe', recipeId: row.recipeId }
    case 'stay-quiet':
      return { kind: 'stay-quiet' }
    default:
      return undefined
  }
}

function decisionOf(): NonNullable<Recipe['decision']> {
  const rows = answers.value
  const text = question.value.trim()
  const questionShape = questionType.value === 'noul'
    ? { type: 'noul' as const, instructions: text, criteria: { true: rows[0]!.meaning.trim(), false: rows[1]!.meaning.trim() } }
    : { type: 'choice' as const, instructions: text, criteria: Object.fromEntries(rows.map((row, index) => [answerKey(index), row.meaning.trim()])) }
  return {
    question: questionShape,
    actions: Object.fromEntries(rows.flatMap((row, index) => {
      const action = rowAction(row)
      return action ? [[answerKey(index), action]] : []
    })),
  }
}

const canSave = computed(() => {
  if (!name.value.trim())
    return false
  // A decision runs only after one of its keywords matches, so it needs keywords.
  if (props.type === 'decision') {
    return Boolean(question.value.trim()) && words.value.length > 0
      && answers.value.every(row => row.meaning.trim() && (row.action !== 'hint' || row.hint.trim()) && (row.action !== 'recipe' || row.recipeId))
  }
  return Boolean(instructions.value.trim())
})

function save() {
  if (!canSave.value)
    return
  if (props.type === 'decision') {
    emit('save', {
      name: name.value.trim(),
      description: description.value.trim(),
      instructions: '',
      decision: decisionOf(),
      keywords: words.value,
      background: undefined,
    })
    return
  }
  emit('save', {
    name: name.value.trim(),
    description: description.value.trim(),
    instructions: instructions.value.trim(),
    decision: undefined,
    keywords: words.value,
    background: background.value || undefined,
  })
}
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <FieldInput v-model="name" :label="t(`${KEY}.add.name`)" />
    <FieldInput v-model="description" :label="t(`${KEY}.add.description`)" />
    <template v-if="type === 'instructions'">
      <FieldTextArea v-model="instructions" :rows="5" :required="false" :label="t(`${KEY}.add.instructions`)" />
      <FieldValues v-model="keywords" :required="false" :label="t(`${KEY}.add.keywords.label`)">
        <template #description>
          <span :class="['text-wrap']">{{ t(`${KEY}.add.keywords.description`) }}</span>
        </template>
      </FieldValues>
      <FieldCheckbox v-model="background" :label="t(`${KEY}.background.label`)" :description="t(`${KEY}.background.description`)" />
    </template>
    <template v-else>
      <FieldValues v-model="keywords" :required="false" :label="t(`${KEY}.add.keywords.label`)">
        <template #description>
          <span :class="['text-wrap']">{{ t(`${KEY}.decision.keywords`) }}</span>
        </template>
      </FieldValues>
      <FieldInput v-model="question" :label="t(`${KEY}.decision.question`)" />
      <FieldSelect :model-value="questionType" :label="t(`${KEY}.decision.type.label`)" :options="questionTypeOptions" @update:model-value="value => setQuestionType(value as QuestionType)" />
      <ol :class="['flex flex-col', 'gap-3']">
        <li
          v-for="(row, index) in answers"
          :key="index"
          :class="['flex flex-col', 'gap-3', 'rounded-lg', 'bg-neutral-100 dark:bg-neutral-900/60', 'p-3']"
        >
          <FieldInput v-model="row.meaning" :label="answerLabel(index)" />
          <FieldSelect v-model="row.action" :label="t(`${KEY}.decision.action.label`)" :options="actionOptions" />
          <FieldInput v-if="row.action === 'hint'" v-model="row.hint" :label="t(`${KEY}.decision.hint_text`)" />
          <FieldSelect v-if="row.action === 'recipe'" v-model="row.recipeId" :label="t(`${KEY}.decision.target_recipe`)" :options="recipeOptions" />
          <div v-if="questionType !== 'noul' && answers.length > 2">
            <Button size="sm" icon="i-solar:trash-bin-minimalistic-linear" :label="t(`${KEY}.decision.remove_option`)" @click="answers.splice(index, 1)" />
          </div>
        </li>
      </ol>
      <div v-if="questionType !== 'noul'">
        <Button size="sm" icon="i-solar:add-circle-linear" :label="t(`${KEY}.decision.add_option`)" @click="answers.push(emptyRow())" />
      </div>
      <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.decision.note`) }}
      </p>
    </template>
    <div :class="['flex flex-wrap justify-end', 'gap-2']">
      <Button size="sm" :label="t(`${KEY}.cancel`)" @click="emit('cancel')" />
      <Button size="sm" variant="primary" :label="t(recipe ? `${KEY}.save` : `${KEY}.add.submit`)" :disabled="!canSave" @click="save" />
    </div>
  </div>
</template>
