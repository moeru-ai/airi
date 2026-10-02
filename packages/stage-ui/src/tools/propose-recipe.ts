import type { DecisionAction, Recipe } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'
import type { InferOutput } from 'valibot'

import { rawTool } from '@xsai/tool'
import { array, description, maxLength, minLength, nullable, picklist, pipe, safeParse, strictObject, string } from 'valibot'
import { toJsonSchema } from 'xsschema'

export const PROPOSE_RECIPE_TOOL_NAME = 'builtIn_proposeRecipe'

/** Guidance for runs that may propose recipes. */
export const PROPOSE_RECIPE_TOOLSET_PROMPT = [
  `A recipe is a reusable skill of yours. When the owner asks you to create or save one, call ${PROPOSE_RECIPE_TOOL_NAME}.`,
  'Ask first when the goal, the trigger, or the steps are unclear. Call the tool once the recipe is settled, not to draft it.',
  'Use style "instructions" for steps you follow when they fit. Use style "decision" for a quick question that the classifier answers before you reply.',
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
    return {
      name: input.name.trim(),
      description: input.description.trim(),
      style: { kind: 'instructions', instructions: input.instructions.trim() },
      triggers: keywords.length ? [{ kind: 'keyword', keywords }] : [],
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
