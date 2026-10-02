import type { DecisionAction, Recipe } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'
import type { InferOutput } from 'valibot'

import { rawTool } from '@xsai/tool'
import { array, description, maxLength, minLength, nullable, number, picklist, pipe, safeParse, strictObject, string } from 'valibot'
import { toJsonSchema } from 'xsschema'

export const PROPOSE_RECIPE_TOOL_NAME = 'builtIn_proposeRecipe'

/** Guidance for runs that may propose recipes. */
export const PROPOSE_RECIPE_TOOLSET_PROMPT = [
  `A recipe is a reusable skill of yours. When the owner asks you to create or save one, call ${PROPOSE_RECIPE_TOOL_NAME}.`,
  'Ask first when the goal, the trigger, or the steps are unclear. Call the tool once the recipe is settled, not to draft it.',
  'Use style "instructions" for steps you follow when they fit. Use style "decision" for a quick question that the classifier answers before you reply.',
  'For something you do on your own without a message, such as greeting the owner after a long silence, use style "instructions" with autoRun. You cannot start messages yourself without such a recipe.',
  'An autoRun gate lets the classifier decide whether the recipe runs when its trigger fires, so a needless run costs no reply.',
  'A saved recipe waits for the owner\'s approval in Settings, under Modules, Long-term memory, Recipes. Tell the owner so.',
].join('\n')

// Strict function calling needs every property in `required`. A value that does not apply is null.
const answerSchema = strictObject({
  meaning: pipe(string(), minLength(1), maxLength(200), description('What this answer means.')),
  action: pipe(picklist(['reply', 'stay-quiet', 'hint']), description('What happens on this answer: reply as usual, read without replying, or add a hint to the reply.')),
  hint: nullable(pipe(string(), maxLength(300), description('The hint text for the hint action. Null otherwise.'))),
})

const proposeRecipeParameters = strictObject({
  name: pipe(string(), minLength(1), maxLength(80), description('A short name for the recipe.')),
  description: pipe(string(), maxLength(400), description('When the recipe fits.')),
  style: pipe(picklist(['instructions', 'decision']), description('instructions: steps to follow. decision: one question answered before a reply.')),
  instructions: nullable(pipe(string(), maxLength(4000), description('For instructions: what to do, step by step. Null for decision.'))),
  keywords: nullable(pipe(array(pipe(string(), maxLength(60))), description('For instructions: words in a message that point to this recipe. Null when none.'))),
  question: nullable(pipe(string(), maxLength(400), description('For decision: the question about the latest message. Null for instructions.'))),
  answerType: nullable(pipe(picklist(['noul', 'choice', 'score']), description('For decision: noul is yes or no with exactly two answers, yes first. choice picks one answer. score orders answers from lowest to highest. Null for instructions.'))),
  answers: nullable(pipe(array(answerSchema), description('For decision: the possible answers and their actions. Null for instructions.'))),
  autoRun: nullable(pipe(strictObject({
    when: pipe(picklist(['idle', 'schedule']), description('idle: after the owner sends no message for the given minutes, once per silence. schedule: every given minutes.')),
    // Strict function calling may reject numeric bounds in the schema, so the tool checks them.
    minutes: pipe(number(), description('Whole minutes for the trigger, from 1 to 10080.')),
    gate: nullable(pipe(string(), maxLength(300), description('A yes-or-no question that the classifier answers when the trigger fires. A confident no skips the run, for example "Is it late at night?". Null to always run.'))),
  }), description('For instructions that start on their own, without a message. Null for recipes that a conversation uses.'))),
})

function toAction(answer: { action: 'reply' | 'stay-quiet' | 'hint', hint: string | null }): DecisionAction {
  if (answer.action === 'hint')
    return { kind: 'hint', text: answer.hint?.trim() ?? '' }
  return { kind: answer.action }
}

/**
 * Builds the recipe that the tool input describes.
 * Returns an error text when a style misses what it needs, so the model can fix its call.
 */
function recipeFromInput(input: InferOutput<typeof proposeRecipeParameters>): Omit<Recipe, 'id' | 'source' | 'approved' | 'enabled'> | string {
  const keywords = input.keywords?.map(word => word.trim()).filter(Boolean) ?? []
  if (input.style === 'instructions') {
    if (!input.instructions?.trim())
      return 'An instructions recipe needs instructions.'
    if (input.autoRun && (!Number.isInteger(input.autoRun.minutes) || !(input.autoRun.minutes >= 1) || !(input.autoRun.minutes <= 10_080)))
      return 'autoRun minutes must be a whole number from 1 to 10080.'
    const autoRun = input.autoRun?.when === 'idle'
      ? [{ kind: 'idle' as const, afterMinutes: input.autoRun.minutes }]
      : input.autoRun?.when === 'schedule' ? [{ kind: 'schedule' as const, everyMinutes: input.autoRun.minutes }] : []
    const gate = input.autoRun?.gate?.trim()
    return {
      name: input.name.trim(),
      description: input.description.trim(),
      style: { kind: 'instructions', instructions: input.instructions.trim() },
      triggers: [...(keywords.length ? [{ kind: 'keyword' as const, keywords }] : []), ...autoRun],
      ...(gate ? { gate } : {}),
    }
  }

  const answers = input.answers ?? []
  const type = input.answerType ?? 'noul'
  if (!input.question?.trim() || answers.length < 2)
    return 'A decision recipe needs a question and at least two answers.'
  if (type === 'noul' && answers.length !== 2)
    return 'A yes-or-no decision needs exactly two answers, yes first.'
  if (answers.some(answer => answer.action === 'hint' && !answer.hint?.trim()))
    return 'A hint answer needs hint text.'

  const keys = answers.map((_answer, index) => type === 'noul' ? (index === 0 ? 'true' : 'false') : type === 'choice' ? `option_${index + 1}` : String(index))
  const instructions = input.question.trim()
  const question = type === 'noul'
    ? { type, instructions, criteria: { true: answers[0]!.meaning, false: answers[1]!.meaning } }
    : type === 'choice'
      ? { type, instructions, criteria: Object.fromEntries(answers.map((answer, index) => [keys[index]!, answer.meaning])) }
      : { type, instructions, criteria: answers.map(answer => answer.meaning) }
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    style: { kind: 'decision', question, actions: Object.fromEntries(answers.map((answer, index) => [keys[index]!, toAction(answer)])) },
    triggers: [],
  }
}

/** Options for the recipe proposal tool. */
export interface CreateProposeRecipeToolOptions {
  /** Stores the proposal unapproved. The owner approves it in Settings. */
  propose: (recipe: Omit<Recipe, 'id' | 'source' | 'approved' | 'enabled'>) => Recipe
}

/**
 * Creates the tool that lets a conversation run save a recipe the owner asked for.
 * The caller offers it only to owner-private runs, and every proposal waits for the owner's approval.
 */
export async function createProposeRecipeTool(options: CreateProposeRecipeToolOptions): Promise<Tool[]> {
  const parameters = await toJsonSchema(proposeRecipeParameters)

  return [
    rawTool({
      name: PROPOSE_RECIPE_TOOL_NAME,
      description: 'Save a recipe that the owner asked for. It waits for the owner\'s approval before it runs.',
      parameters,
      execute: async (rawInput) => {
        const parsed = safeParse(proposeRecipeParameters, rawInput)
        if (!parsed.success)
          return 'Recipe not saved: the input does not match the schema.'
        const recipe = recipeFromInput(parsed.output)
        if (typeof recipe === 'string')
          return `Recipe not saved: ${recipe}`
        const proposal = options.propose(recipe)
        return `Saved the recipe proposal "${proposal.name}". It waits for the owner's approval in Settings, under Modules, Long-term memory, Recipes.`
      },
    }),
  ]
}
