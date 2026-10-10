import type { DecisionAction, Recipe } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'

import { decisionOptions, judgeDecision } from '@proj-airi/core-agent'
import { rawTool } from '@xsai/tool'
import { description, literal, maxLength, minLength, object, pipe, safeParse, strictObject, string, summarize, union } from 'valibot'
import { toJsonSchema } from 'xsschema'

import { ARM_RECIPE_TOOL_NAME } from './arm-recipe'

export const JUDGE_RECIPE_TOOL_NAME = 'builtIn_judge'

/** How the host starts a background recipe that a judged answer leads to. */
export type StartJudgedRecipe = (recipe: Recipe) => Promise<{ status: 'started' } | { status: 'refused', reason: string }>

/**
 * What the tool returns. The chat renders it, and the character reads `next` as its next step.
 * - `judged`: the answer that the character chose, and the next step that code chose for it.
 * - `invalid`: what the call got wrong, so the character can fix it.
 */
type JudgeResult
  = | { status: 'judged', name: string, answer: string, next: string }
    | { status: 'invalid', reason: string }

const judgeParameters = strictObject({
  name: pipe(string(), minLength(1), maxLength(80), description('The name of the recipe whose question you judge.')),
  answer: pipe(string(), minLength(1), maxLength(20), description('The id of the answer that fits, as the question lists it. Always pick one.')),
})

const judgeResultSchema = union([
  object({ status: literal('judged'), name: string(), answer: string(), next: string() }),
  object({ status: literal('invalid'), reason: string() }),
])

/**
 * The skill text of a decision recipe: its question and its answers, and nothing about what each answer leads to.
 * The character judges without seeing the consequences, and the tool result feeds the next step.
 */
export function judgmentSkillText(recipe: Recipe) {
  const question = recipe.decision?.question
  if (!question)
    return recipe.instructions.trim()
  return [
    `Before you reply, judge this from the whole conversation: ${question.instructions.trim()}`,
    'Answers:',
    ...decisionOptions(question).map(option => `- ${option.id}: ${option.meaning.trim()}`),
    `Call ${JUDGE_RECIPE_TOOL_NAME} with name "${recipe.name}" and the answer that fits. Pick one answer even when the conversation leaves doubt, because there is no unsure answer. Its result tells you what to do next. Do not mention the judgment.`,
  ].join('\n')
}

/** Reads a recorded tool argument or result. Text is parsed as JSON, and text that is not JSON has no value. */
export function parseJson(value: unknown): unknown {
  if (typeof value !== 'string')
    return value
  try {
    return JSON.parse(value)
  }
  catch {
    return undefined
  }
}

/** Reads a recorded call for the chat: the recipe name from the arguments, and the outcome from the result. A running call has no outcome. */
export function readJudgment(args: string, result: unknown): { name: string, outcome?: JudgeResult } {
  const input = safeParse(judgeParameters, parseJson(args))
  const outcome = safeParse(judgeResultSchema, parseJson(result))
  return {
    name: outcome.success && outcome.output.status === 'judged' ? outcome.output.name : input.success ? input.output.name : '',
    outcome: outcome.success ? outcome.output : undefined,
  }
}

/** Options for the judgment tool. */
interface CreateJudgeRecipeToolOptions {
  /** Decision recipes that the owner invoked by keyword in this conversation, or that a judged answer led to. */
  decisions: readonly Recipe[]
  /** Usable recipes that an answer can lead to. */
  recipes: readonly Recipe[]
  start: StartJudgedRecipe
}

/**
 * Creates the tool that answers the question of an invoked decision recipe.
 * The character gives only the answer that it picks. Code returns the next step of that answer.
 */
export async function createJudgeRecipeTool(options: CreateJudgeRecipeToolOptions): Promise<Tool[]> {
  const parameters = await toJsonSchema(judgeParameters)

  /** The next step of an answer. Only code chooses it. */
  async function nextStep(action: DecisionAction | undefined): Promise<string> {
    switch (action?.kind) {
      case 'stay-quiet':
        return 'Do not reply to this message. End this turn with no text.'
      case 'hint':
        return `Reply, and keep this in mind: ${action.text.trim()}`
      case 'recipe': {
        const target = options.recipes.find(recipe => recipe.id === action.recipeId)
        if (!target)
          return 'Reply as usual.'
        if (target.decision)
          return `Next, ${judgmentSkillText(target)}`
        if (target.modelTimed)
          return `Set when "${target.name}" runs with ${ARM_RECIPE_TOOL_NAME}, only from the owner's words. ${target.modelFlow ? 'When it runs, it decides what to do from the owner\'s words.' : `It follows these steps then:\n${target.instructions.trim()}`}`
        if (target.background) {
          const started = await options.start(target)
          return started.status === 'started'
            ? `"${target.name}" runs in the background, and its result reaches you later. Reply briefly, and do not do its task yourself.`
            : 'Reply as usual.'
        }
        return `Follow the steps of "${target.name}":\n${target.instructions.trim()}`
      }
      default:
        return 'Reply as usual.'
    }
  }

  return [
    rawTool({
      name: JUDGE_RECIPE_TOOL_NAME,
      description: [
        'Answer the question of a decision recipe that the owner invoked. Judge only from the conversation.',
        'Give the id of the answer that fits. Always pick one answer: there is no unsure answer.',
        `The result tells you what to do next. Decision recipes: ${options.decisions.map(recipe => recipe.name).join(', ')}.`,
      ].join('\n'),
      parameters,
      execute: async (rawInput) => {
        const parsed = safeParse(judgeParameters, rawInput)
        if (!parsed.success)
          return JSON.stringify({ status: 'invalid', reason: `The input does not match the schema.\n${summarize(parsed.issues)}` } satisfies JudgeResult)
        const wanted = parsed.output.name.trim().toLowerCase()
        const recipe = options.decisions.find(entry => entry.name.trim().toLowerCase() === wanted)
        if (!recipe?.decision)
          return JSON.stringify({ status: 'invalid', reason: `No invoked decision recipe has that name. Decision recipes: ${options.decisions.map(entry => entry.name).join(', ')}.` } satisfies JudgeResult)
        const judged = judgeDecision(recipe.decision, parsed.output.answer)
        if (typeof judged === 'string')
          return JSON.stringify({ status: 'invalid', reason: judged } satisfies JudgeResult)
        return JSON.stringify({ status: 'judged', name: recipe.name, answer: judged.option.meaning, next: await nextStep(judged.action) } satisfies JudgeResult)
      },
    }),
  ]
}
