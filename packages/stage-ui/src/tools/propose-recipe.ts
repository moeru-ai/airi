import type { DecisionAction, Recipe } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'
import type { InferOutput } from 'valibot'

import { MODEL_DECIDES_STEPS } from '@proj-airi/core-agent'
import { rawTool } from '@xsai/tool'
import { array, boolean, description, maxLength, minLength, nullable, picklist, pipe, safeParse, strictObject, string, summarize } from 'valibot'
import { toJsonSchema } from 'xsschema'

import { automationFromInput, automationInputSchema } from './automation-input'

export const PROPOSE_RECIPE_TOOL_NAME = 'builtIn_proposeRecipe'

/** How to propose a recipe. The tool's description carries it. */
const PROPOSE_RECIPE_DESCRIPTION = [
  'Save a recipe that the owner asked for. A recipe is a reusable skill of yours. Call this when the owner asks you to create or save one.',
  'Ask first when the goal, the trigger, or the steps are unclear. Call the tool once the recipe is settled, not to draft it.',
  'Use style "instructions" for steps you follow when they fit. Use style "decision" for a question that you judge after a keyword matches, before you reply. You always pick one of its answers, and each answer leads to an action.',
  'For something you do on your own without a message, use style "instructions" with an automation: triggers, conditions, and a cooldown. You cannot start messages yourself without such a recipe.',
  'For example, greeting the owner back after an hour away is a mouse active trigger with afterIdleMinutes 60. Noticing late-night coding is a keyboard active trigger with a time condition from 22:00 to 04:00 and a cooldown.',
  'When the owner wants something done at a later time, such as a reminder, ask whether they want a fixed schedule or a reusable recipe whose time you set each time they ask. Never save the time of one request as an automation.',
  'A reusable one is modelTimed with keywords and no automation. When a keyword invokes it, you set its triggers and conditions from the owner\'s message, and it runs once.',
  `When the owner wants you to decide what each run does, use these instructions: "${MODEL_DECIDES_STEPS}"`,
  'Set background for a task that runs on its own and reports a result later, such as research. Leave it false for steps you follow in the conversation, such as a way of answering.',
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
  style: pipe(picklist(['instructions', 'decision']), description('instructions: steps to follow. decision: one question answered after a keyword matches, before a reply.')),
  instructions: nullable(pipe(string(), maxLength(4000), description('For instructions: what to do, step by step. Null for decision.'))),
  keywords: nullable(pipe(array(pipe(string(), maxLength(60))), description('Words in a message that point to this recipe. A decision needs at least one. Null with an automation, and when none.'))),
  question: nullable(pipe(string(), maxLength(400), description('For decision: the question about the latest message. Null for instructions.'))),
  answerType: nullable(pipe(picklist(['noul', 'choice', 'score']), description('For decision: noul is yes or no with exactly two answers, yes first. choice picks one answer. score orders answers from lowest to highest. Null for instructions.'))),
  answers: nullable(pipe(array(answerSchema), description('For decision: the possible answers and their actions. Null for instructions.'))),
  background: pipe(boolean(), description('For instructions: true for a task that runs in its own space and reports a result later. False for steps you follow in the conversation.')),
  automation: nullable(pipe(automationInputSchema, description('For instructions that run on their own, without a message. Null for recipes that a conversation uses, and when modelTimed.'))),
  modelTimed: pipe(boolean(), description('For instructions: true when you set when it runs, each time a keyword invokes it. It needs keywords and no automation. False otherwise.')),
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
  if (input.style === 'decision')
    return input.modelTimed ? 'A decision answers a message now, so it cannot be modelTimed.' : decisionRecipeFromInput(input, keywords)
  if (input.automation && keywords.length)
    return 'A recipe with an automation runs only on it, so it takes no keywords.'
  if (input.modelTimed && (input.automation || !keywords.length))
    return 'A modelTimed recipe needs keywords and no automation. You set when it runs each time a keyword invokes it.'
  const instructions = input.instructions?.trim() ?? ''
  if (!instructions)
    return 'An instructions recipe needs instructions.'
  const automation = input.automation ? automationFromInput(input.automation) : undefined
  if (typeof automation === 'string')
    return automation
  const runsOnItsOwn = Boolean(automation) || input.modelTimed
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    instructions,
    triggers: keywords.length ? [{ kind: 'keyword' as const, keywords }] : [],
    ...(automation ? { automation } : {}),
    ...(input.modelTimed ? { modelTimed: true } : {}),
    // A recipe that runs on its own always runs in its own space, so only conversation recipes choose.
    ...(input.background && !runsOnItsOwn ? { background: true } : {}),
  }
}

/** Builds a decision recipe. Its answer keys are true and false, option names, or level indexes. */
function decisionRecipeFromInput(input: InferOutput<typeof proposeRecipeParameters>, keywords: string[]): Omit<Recipe, 'id' | 'source' | 'approved' | 'enabled'> | string {
  const answers = input.answers ?? []
  const type = input.answerType ?? 'noul'
  if (!keywords.length)
    return 'A decision runs only after a keyword matches, so it needs keywords.'
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
    instructions: '',
    decision: {
      question,
      actions: Object.fromEntries(answers.map((answer, index) => [keys[index]!, toAction(answer)])),
    },
    triggers: [{ kind: 'keyword', keywords }],
  }
}

/** Options for the recipe proposal tool. */
interface CreateProposeRecipeToolOptions {
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
      description: PROPOSE_RECIPE_DESCRIPTION,
      parameters,
      execute: async (rawInput) => {
        const parsed = safeParse(proposeRecipeParameters, rawInput)
        // Some providers do not enforce the schema, so the model learns which field to fix.
        if (!parsed.success)
          return `Recipe not saved: the input does not match the schema. Every field is required, with null when it does not apply.\n${summarize(parsed.issues)}`
        const recipe = recipeFromInput(parsed.output)
        if (typeof recipe === 'string')
          return `Recipe not saved: ${recipe}`
        const proposal = options.propose(recipe)
        return `Saved the recipe proposal "${proposal.name}". It waits for the owner's approval in Settings, under Modules, Long-term memory, Recipes.`
      },
    }),
  ]
}
