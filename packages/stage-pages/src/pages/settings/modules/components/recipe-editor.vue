<script setup lang="ts">
import type { AutomationCondition, AutomationTrigger, Weekday } from '@proj-airi/core-agent'
import type { DecisionAction, Recipe, RecipeFields } from '@proj-airi/stage-ui/stores/recipes'
import type { ConditionInput, TriggerInput } from '@proj-airi/stage-ui/tools/automation-input'

import { MODEL_DECIDES_STEPS } from '@proj-airi/core-agent'
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { automationFromInput } from '@proj-airi/stage-ui/tools/automation-input'
import { Button, FieldCheckbox, FieldInput, FieldSelect, FieldTextArea, FieldValues, Textarea } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import WeekdayPicker from './weekday-picker.vue'

/** Recipe types that the owner can write. */
type RecipeType = 'instructions' | 'decision'
type QuestionType = 'noul' | 'choice'
/** What an answer row does. `reply` replies as usual, so it stores no action. */
type ActionKind = DecisionAction['kind'] | 'reply'

/** A row of the form. Every field keeps a value, so switching a source or a check keeps what the owner typed. */
type Filled<T> = Omit<{ [K in keyof T]: NonNullable<T[K]> }, 'days'> & { days: Weekday[] }
type TriggerRow = Filled<TriggerInput>
type ConditionRow = Filled<ConditionInput>
type TriggerSource = TriggerRow['source']

const props = defineProps<{
  type: RecipeType
  /** The recipe to edit. Without it, the form starts empty. */
  recipe?: Recipe
  /** Recipes that an answer can point to. */
  targets: readonly Recipe[]
  /** Writes an instructions recipe that starts on its automation instead of keywords. */
  autoRun?: boolean
  /** Registered modules that a module trigger can follow. */
  sources?: readonly string[]
}>()

const emit = defineEmits<{
  (e: 'save', fields: RecipeFields): void
  (e: 'cancel'): void
}>()

/** The events of each source, in the order the select lists them. */
const SOURCE_EVENTS: Record<TriggerSource, TriggerRow['event'][]> = {
  clock: ['at', 'every'],
  chat: ['message', 'idle'],
  mouse: ['active', 'idle'],
  keyboard: ['active', 'idle'],
  module: ['observation'],
}

/** One answer row of a decision and the action it leads to. */
interface AnswerRow {
  meaning: string
  action: ActionKind
  hint: string
  recipeId: string
}

const { t } = useI18n()
const KEY = 'settings.pages.modules.memory-long-term.recipes'

function triggerRow(trigger?: AutomationTrigger): TriggerRow {
  return { source: 'clock', event: 'at', time: '08:00', days: [], minutes: 30, afterIdleMinutes: 0, module: '', ...trigger }
}

function conditionRow(condition?: AutomationCondition): ConditionRow {
  return { kind: 'time', from: '22:00', to: '06:00', days: [], source: 'chat', state: 'idle', minutes: 30, ...condition }
}

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
const automation = props.recipe?.automation

const name = ref(props.recipe?.name ?? '')
const description = ref(props.recipe?.description ?? '')
const instructions = ref(props.recipe?.instructions ?? '')
/** One keyword per row. A form without keywords starts with one empty row. */
const keywords = ref<string[]>(props.recipe?.keywords.length ? [...props.recipe.keywords] : [''])
const triggerRows = ref<TriggerRow[]>(automation?.triggers.map(trigger => triggerRow(trigger)) ?? [triggerRow()])
const conditionRows = ref<ConditionRow[]>(automation?.conditions.map(condition => conditionRow(condition)) ?? [])
const cooldown = ref(automation?.cooldownMinutes ?? 0)
/** Who sets when an auto-run recipe runs: the owner's triggers below, or the model each time a keyword invokes it. */
const timing = ref<'owner' | 'model'>(props.recipe?.modelTimed ? 'model' : 'owner')
/** Who decides what each auto-run does: the owner's instructions, or the model each time it runs through preset instructions. */
const flow = ref<'owner' | 'model'>(props.recipe?.instructions === MODEL_DECIDES_STEPS ? 'model' : 'owner')
const background = ref(props.recipe?.background ?? false)
const question = ref(decision?.question.instructions ?? '')
const questionType = ref<QuestionType>(decision?.question.type ?? 'noul')
const answers = ref<AnswerRow[]>(decision ? rowsFrom(decision) : [emptyRow(), emptyRow()])

/** Yes or no has two fixed answers. Choices and levels start with two and can grow. */
function setQuestionType(type: QuestionType) {
  questionType.value = type
  answers.value = [emptyRow(), emptyRow()]
}

/** A trigger keeps its event when the new source has it too. */
function setSource(row: TriggerRow, source: TriggerSource) {
  row.source = source
  if (!SOURCE_EVENTS[source].includes(row.event))
    row.event = SOURCE_EVENTS[source][0]!
}

const flowOptions = computed(() => (['owner', 'model'] as const).map(value => ({ label: t(`${KEY}.auto_run.flow.${value}`), value })))
const timingOptions = computed(() => (['owner', 'model'] as const).map(value => ({ label: t(`${KEY}.auto_run.timing.${value}`), value })))
/** The desktop app on Linux, where some desktops do not report input from other apps. */
const linuxDesktop = isStageTamagotchi() && globalThis.navigator?.userAgent.includes('Linux')

/** A note under a mouse or keyboard source on Linux. */
function inputSourceNote(source: string) {
  return linuxDesktop && (source === 'mouse' || source === 'keyboard') ? t(`${KEY}.auto_run.source.linux_note`) : undefined
}

const sourceOptions = computed(() => (Object.keys(SOURCE_EVENTS) as TriggerSource[]).map(source => ({ label: t(`${KEY}.auto_run.source.${source}`), value: source })))
const eventOptions = (source: TriggerSource) => SOURCE_EVENTS[source].map(event => ({ label: t(`${KEY}.auto_run.event.${event}`), value: event }))
// A stored module stays selectable while it is offline.
const moduleOptions = computed(() => [...new Set([...props.sources ?? [], ...triggerRows.value.filter(row => row.source === 'module' && row.module).map(row => row.module)])]
  .map(module => ({ label: module, value: module })))
const conditionOptions = computed(() => (['time', 'weekday', 'state'] as const).map(kind => ({ label: t(`${KEY}.auto_run.condition.${kind}`), value: kind })))
const stateSourceOptions = computed(() => (['chat', 'mouse', 'keyboard'] as const).map(source => ({ label: t(`${KEY}.auto_run.source.${source}`), value: source })))
const stateOptions = computed(() => (['idle', 'active'] as const).map(state => ({ label: t(`${KEY}.auto_run.condition.${state}`), value: state })))
/** The automation of the form, or an error text while a field is incomplete. */
const builtAutomation = computed(() => automationFromInput({
  triggers: triggerRows.value.map(row => ({ ...row, afterIdleMinutes: row.afterIdleMinutes || null })),
  conditions: conditionRows.value,
  cooldownMinutes: cooldown.value || null,
}))
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

/** The model decides what each run does, so the recipe saves the preset instructions. */
const modelDecides = computed(() => props.autoRun && flow.value === 'model')

const canSave = computed(() => {
  if (!name.value.trim())
    return false
  // A decision runs only after one of its keywords matches, so it needs keywords.
  if (props.type === 'decision') {
    return Boolean(question.value.trim()) && words.value.length > 0
      && answers.value.every(row => row.meaning.trim() && (row.action !== 'hint' || row.hint.trim()) && (row.action !== 'recipe' || row.recipeId))
  }
  if (!props.autoRun)
    return Boolean(instructions.value.trim())
  if (!modelDecides.value && !instructions.value.trim())
    return false
  // A keyword in the owner's message invokes a model-timed recipe, so it needs keywords.
  return timing.value === 'model' ? words.value.length > 0 : typeof builtAutomation.value !== 'string'
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
      automation: undefined,
      modelTimed: undefined,
      background: undefined,
    })
    return
  }
  // A recipe with the owner's automation runs only on it, so it keeps no keywords.
  const modelTimed = props.autoRun && timing.value === 'model'
  const built = builtAutomation.value
  const automated = props.autoRun && !modelTimed && typeof built !== 'string' ? built : undefined
  emit('save', {
    name: name.value.trim(),
    description: description.value.trim(),
    instructions: modelDecides.value ? MODEL_DECIDES_STEPS : instructions.value.trim(),
    decision: undefined,
    keywords: automated ? [] : words.value,
    automation: automated,
    modelTimed: modelTimed || undefined,
    background: !props.autoRun && background.value ? true : undefined,
  })
}
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <FieldInput v-model="name" :label="t(`${KEY}.add.name`)" />
    <FieldInput v-model="description" :label="t(`${KEY}.add.description`)" />
    <template v-if="type === 'instructions'">
      <!-- An auto-run recipe follows the owner's instructions, or the model decides what each run does. -->
      <template v-if="autoRun">
        <FieldSelect v-model="flow" :label="t(`${KEY}.add.instructions`)" :options="flowOptions" />
        <Textarea v-if="!modelDecides" v-model="instructions" :rows="5" />
      </template>
      <FieldTextArea v-else v-model="instructions" :rows="5" :required="false" :label="t(`${KEY}.add.instructions`)" />
      <template v-if="autoRun">
        <FieldSelect v-model="timing" :label="t(`${KEY}.auto_run.timing.label`)" :options="timingOptions" />
        <!-- NOTICE:
          FieldValues keeps its description on one line, so a long description leaves the form on a phone.
          Its description wrapper uses text-nowrap, and text-wrap is inherited, so the span below wraps only this text.
          Source: packages/ui/src/components/form/field/field-values.vue.
          Remove the span when FieldValues wraps its description. Every keyword list in this form uses it. -->
        <FieldValues v-if="timing === 'model'" v-model="keywords" :required="false" :label="t(`${KEY}.add.keywords.label`)">
          <template #description>
            <span :class="['text-wrap']">{{ t(`${KEY}.auto_run.timing.keywords`) }}</span>
          </template>
        </FieldValues>
      </template>
      <template v-if="autoRun && timing === 'owner'">
        <div>
          <div :class="['text-sm font-medium']">
            {{ t(`${KEY}.auto_run.triggers.label`) }}
          </div>
          <div :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
            {{ t(`${KEY}.auto_run.triggers.description`) }}
          </div>
        </div>
        <ol :class="['flex flex-col', 'gap-3']">
          <li
            v-for="(row, index) in triggerRows"
            :key="index"
            :class="['flex flex-col', 'gap-3', 'rounded-lg', 'bg-neutral-100 dark:bg-neutral-900/60', 'p-3']"
          >
            <FieldSelect :model-value="row.source" :label="t(`${KEY}.auto_run.source.label`)" :description="inputSourceNote(row.source)" :options="sourceOptions" @update:model-value="value => setSource(row, value as TriggerSource)" />
            <FieldSelect v-model="row.event" :label="t(`${KEY}.auto_run.event.label`)" :options="eventOptions(row.source)" />
            <template v-if="row.event === 'at'">
              <FieldInput v-model="row.time" type="time" :label="t(`${KEY}.auto_run.time.label`)" :description="t(`${KEY}.auto_run.time.description`)" />
              <WeekdayPicker v-model="row.days" :label="t(`${KEY}.auto_run.days.label`)" :description="t(`${KEY}.auto_run.days.description`)" />
            </template>
            <FieldInput v-else-if="row.event === 'every' || row.event === 'idle'" v-model="row.minutes" type="number" :label="t(`${KEY}.auto_run.minutes.label`)" :description="t(`${KEY}.auto_run.minutes.${row.event}`)" />
            <FieldInput v-else-if="row.event === 'active'" v-model="row.afterIdleMinutes" type="number" :label="t(`${KEY}.auto_run.after_idle.label`)" :description="t(`${KEY}.auto_run.after_idle.description`)" />
            <template v-else-if="row.event === 'observation'">
              <FieldSelect v-if="moduleOptions.length" v-model="row.module" :label="t(`${KEY}.auto_run.module.label`)" :description="t(`${KEY}.auto_run.module.description`)" :options="moduleOptions" />
              <p v-else :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
                {{ t(`${KEY}.auto_run.module.none`) }}
              </p>
            </template>
            <div v-if="triggerRows.length > 1">
              <Button size="sm" icon="i-solar:trash-bin-minimalistic-linear" :label="t(`${KEY}.auto_run.triggers.remove`)" @click="triggerRows.splice(index, 1)" />
            </div>
          </li>
        </ol>
        <div>
          <Button size="sm" icon="i-solar:add-circle-linear" :label="t(`${KEY}.auto_run.triggers.add`)" @click="triggerRows.push(triggerRow())" />
        </div>
        <div>
          <div :class="['text-sm font-medium']">
            {{ t(`${KEY}.auto_run.conditions.label`) }}
          </div>
          <div :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
            {{ t(`${KEY}.auto_run.conditions.description`) }}
          </div>
        </div>
        <ol v-if="conditionRows.length" :class="['flex flex-col', 'gap-3']">
          <li
            v-for="(row, index) in conditionRows"
            :key="index"
            :class="['flex flex-col', 'gap-3', 'rounded-lg', 'bg-neutral-100 dark:bg-neutral-900/60', 'p-3']"
          >
            <FieldSelect v-model="row.kind" :label="t(`${KEY}.auto_run.condition.label`)" :options="conditionOptions" />
            <template v-if="row.kind === 'time'">
              <FieldInput v-model="row.from" type="time" :label="t(`${KEY}.auto_run.condition.from`)" />
              <FieldInput v-model="row.to" type="time" :label="t(`${KEY}.auto_run.condition.to`)" :description="t(`${KEY}.auto_run.condition.range`)" />
            </template>
            <WeekdayPicker v-else-if="row.kind === 'weekday'" v-model="row.days" :label="t(`${KEY}.auto_run.days.label`)" />
            <template v-else>
              <FieldSelect v-model="row.source" :label="t(`${KEY}.auto_run.source.label`)" :description="inputSourceNote(row.source)" :options="stateSourceOptions" />
              <FieldSelect v-model="row.state" :label="t(`${KEY}.auto_run.condition.state_label`)" :options="stateOptions" />
              <FieldInput v-model="row.minutes" type="number" :label="t(`${KEY}.auto_run.minutes.label`)" />
            </template>
            <div>
              <Button size="sm" icon="i-solar:trash-bin-minimalistic-linear" :label="t(`${KEY}.auto_run.conditions.remove`)" @click="conditionRows.splice(index, 1)" />
            </div>
          </li>
        </ol>
        <div>
          <Button size="sm" icon="i-solar:add-circle-linear" :label="t(`${KEY}.auto_run.conditions.add`)" @click="conditionRows.push(conditionRow())" />
        </div>
        <FieldInput v-model="cooldown" type="number" :label="t(`${KEY}.auto_run.cooldown.label`)" :description="t(`${KEY}.auto_run.cooldown.description`)" />
      </template>
      <template v-if="!autoRun">
        <FieldValues v-model="keywords" :required="false" :label="t(`${KEY}.add.keywords.label`)">
          <template #description>
            <span :class="['text-wrap']">{{ t(`${KEY}.add.keywords.description`) }}</span>
          </template>
        </FieldValues>
        <FieldCheckbox v-model="background" :label="t(`${KEY}.background.label`)" :description="t(`${KEY}.background.description`)" />
      </template>
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
