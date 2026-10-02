<script setup lang="ts">
import type { DecisionAction, Recipe } from '@proj-airi/stage-ui/stores/recipes'

import { Button, FieldInput, FieldSelect, FieldTextArea } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/** Recipe types that the owner can write. */
type EditableRecipeType = Extract<Recipe['style']['kind'], 'instructions' | 'decision'>
type QuestionType = 'noul' | 'choice' | 'score'
type ActionKind = DecisionAction['kind']

/** One answer row of a decision recipe and the action it leads to. */
interface AnswerRow {
  meaning: string
  action: ActionKind
  hint: string
  recipeId: string
}

const props = defineProps<{
  type: EditableRecipeType
  /** The recipe to edit. Without it, the form starts empty. */
  recipe?: Recipe
  /** Recipes that an answer can point to. */
  targets: readonly Recipe[]
  /** Writes an instructions recipe that starts on an idle, schedule, or event trigger instead of keywords. */
  autoRun?: boolean
  /** Registered sources that an event trigger can follow, such as module metrics in the shared pool. */
  sources?: readonly string[]
}>()

const emit = defineEmits<{
  (e: 'save', fields: Pick<Recipe, 'name' | 'description' | 'style' | 'triggers' | 'gate'>): void
  (e: 'cancel'): void
}>()

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

/** Reads the answer rows of a stored decision. Choices keep their order, and levels go from low to high. */
function rowsFrom(style: Extract<Recipe['style'], { kind: 'decision' }>): AnswerRow[] {
  const { question, actions } = style
  if (question.type === 'noul')
    return [rowFrom(question.criteria.true, actions.true), rowFrom(question.criteria.false, actions.false)]
  if (question.type === 'choice')
    return Object.entries(question.criteria).map(([key, meaning]) => rowFrom(meaning, actions[key]))
  return question.criteria.map((meaning, index) => rowFrom(meaning, actions[String(index)]))
}

const style = props.recipe?.style
const decision = style?.kind === 'decision' ? style : undefined

const name = ref(props.recipe?.name ?? '')
const description = ref(props.recipe?.description ?? '')
const instructions = ref(style?.kind === 'instructions' ? style.instructions : '')
const keywords = ref(props.recipe?.triggers.flatMap(trigger => trigger.kind === 'keyword' ? trigger.keywords : []).join(', ') ?? '')
const storedTrigger = props.recipe?.triggers.find(trigger => trigger.kind === 'idle' || trigger.kind === 'schedule' || trigger.kind === 'event')
const triggerKind = ref<'idle' | 'schedule' | 'event'>(storedTrigger?.kind === 'schedule' || storedTrigger?.kind === 'event' ? storedTrigger.kind : 'idle')
const triggerMinutes = ref(storedTrigger?.kind === 'schedule'
  ? storedTrigger.everyMinutes
  : storedTrigger?.kind === 'idle' ? storedTrigger.afterMinutes : storedTrigger?.kind === 'event' ? storedTrigger.cooldownMinutes : 60)
const eventSource = ref(storedTrigger?.kind === 'event' ? storedTrigger.source : '')
const gate = ref(props.recipe?.gate ?? '')
const question = ref(decision?.question.instructions ?? '')
const questionType = ref<QuestionType>(decision?.question.type ?? 'noul')
const answers = ref<AnswerRow[]>(decision ? rowsFrom(decision) : [emptyRow(), emptyRow()])

/** Yes or no has two fixed answers. Choices and levels start with two and can grow. */
function setQuestionType(type: QuestionType) {
  questionType.value = type
  answers.value = [emptyRow(), emptyRow()]
}

const triggerOptions = computed(() => [
  { label: t(`${KEY}.auto_run.when.idle`), value: 'idle' },
  { label: t(`${KEY}.auto_run.when.schedule`), value: 'schedule' },
  { label: t(`${KEY}.auto_run.when.event`), value: 'event' },
])
// A stored source stays selectable while its module is offline.
const sourceOptions = computed(() => [...new Set([...props.sources ?? [], ...(eventSource.value ? [eventSource.value] : [])])].map(source => ({ label: source, value: source })))
const minutesValid = computed(() => Number.isInteger(triggerMinutes.value) && triggerMinutes.value >= 1 && triggerMinutes.value <= 10_080)

const questionTypeOptions = computed(() => (['noul', 'choice', 'score'] as const).map(type => ({ label: t(`${KEY}.decision.type.${type}`), value: type })))
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

const canSave = computed(() => {
  if (!name.value.trim())
    return false
  if (props.type === 'instructions')
    return Boolean(instructions.value.trim()) && (!props.autoRun || (minutesValid.value && (triggerKind.value !== 'event' || Boolean(eventSource.value))))
  return Boolean(question.value.trim())
    && answers.value.every(row => row.meaning.trim() && (row.action !== 'hint' || row.hint.trim()) && (row.action !== 'recipe' || row.recipeId))
})

function save() {
  if (!canSave.value)
    return
  const words = keywords.value.split(/[,，]/).map(word => word.trim()).filter(Boolean)
  const triggers: Recipe['triggers'] = props.type !== 'instructions'
    ? []
    : props.autoRun
      ? [triggerKind.value === 'idle'
          ? { kind: 'idle', afterMinutes: triggerMinutes.value }
          : triggerKind.value === 'event'
            ? { kind: 'event', source: eventSource.value, cooldownMinutes: triggerMinutes.value }
            : { kind: 'schedule', everyMinutes: triggerMinutes.value }]
      : words.length ? [{ kind: 'keyword', keywords: words }] : []
  emit('save', {
    name: name.value.trim(),
    description: description.value.trim(),
    style: props.type === 'instructions' ? { kind: 'instructions', instructions: instructions.value.trim() } : decisionStyle(),
    triggers,
    gate: props.autoRun && gate.value.trim() ? gate.value.trim() : undefined,
  })
}
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <FieldInput v-model="name" :label="t(`${KEY}.add.name`)" />
    <FieldInput v-model="description" :label="t(`${KEY}.add.description`)" />
    <template v-if="type === 'instructions'">
      <FieldTextArea v-model="instructions" :rows="5" :required="false" :label="t(`${KEY}.add.instructions`)" />
      <template v-if="autoRun">
        <FieldSelect v-model="triggerKind" :label="t(`${KEY}.auto_run.when.label`)" :options="triggerOptions" />
        <template v-if="triggerKind === 'event'">
          <FieldSelect v-if="sourceOptions.length" v-model="eventSource" :label="t(`${KEY}.auto_run.source.label`)" :description="t(`${KEY}.auto_run.source.description`)" :options="sourceOptions" />
          <p v-else :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
            {{ t(`${KEY}.auto_run.source.none`) }}
          </p>
        </template>
        <FieldInput v-model="triggerMinutes" type="number" :label="t(`${KEY}.auto_run.minutes.label`)" :description="t(`${KEY}.auto_run.minutes.${triggerKind}`)" />
        <FieldInput v-model="gate" :label="t(`${KEY}.auto_run.gate.label`)" :description="t(`${KEY}.auto_run.gate.description`)" :placeholder="t(`${KEY}.auto_run.gate.placeholder`)" />
      </template>
      <FieldInput v-else v-model="keywords" :label="t(`${KEY}.add.keywords.label`)" :description="t(`${KEY}.add.keywords.description`)" />
    </template>
    <template v-else>
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
